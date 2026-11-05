const INTENT_MS = 1000;
const HOLD_MS = 2500;

/** A clip travelling to the media page: the element itself keeps playing, on a stage above the page change. */
export type HandedClip = { itemId: string; source: string; element: HTMLVideoElement; from: DOMRect };

/** Variants of one server clip live in the same folder; tickets and file names differ. */
export function sameClip(first: string, second: string) {
    if (first === second) return true;
    const folder = (source: string) => {
        const url = new URL(source, 'https://client.invalid/');
        return /\/NativePreviews\/Media\//.test(url.pathname) ? url.origin + url.pathname.slice(0, url.pathname.lastIndexOf('/')) : undefined;
    };
    const folderOfFirst = folder(first);
    return !!folderOfFirst && folderOfFirst === folder(second);
}

/** Same clip, same variant: a new ticket does not make it another file. */
export function sameFile(first: string, second: string) {
    const path = (source: string) => {
        const url = new URL(source, 'https://client.invalid/');
        return url.origin + url.pathname;
    };
    return path(first) === path(second);
}

export class PreviewHandoff {
    private intent?: { id: string; at: number };
    private clip?: HandedClip;
    private stage?: HTMLElement;
    private timer = 0;

    constructor(private readonly stop: () => void) {}

    /** The viewer just asked for this title's page. */
    intend(id: string, now = Date.now()) {
        this.intent = { id, at: now };
    }

    private intended(ids: (string | null | undefined)[], now: number) {
        return !!this.intent && now - this.intent.at <= INTENT_MS && ids.includes(this.intent.id);
    }

    /** A clip is on its way, or about to be: the media page should not wait for the hover delay. */
    pending(now = Date.now()) {
        return !!this.clip || (!!this.intent && now - this.intent.at <= INTENT_MS);
    }

    /** Must run while the element is still in the page: moving it within one task does not interrupt playback. */
    hand(clip: HandedClip, ids: (string | null | undefined)[], now = Date.now()) {
        if (!this.intended(ids, now)) return false;
        this.discard();
        const stage = document.createElement('div');
        stage.className = 'client-preview-media client-preview-stage is-resuming';
        stage.style.left = `${clip.from.left}px`;
        stage.style.top = `${clip.from.top}px`;
        stage.style.width = `${clip.from.width}px`;
        stage.style.height = `${clip.from.height}px`;
        stage.appendChild(clip.element);
        document.body.appendChild(stage);
        this.clip = clip;
        this.stage = stage;
        this.intent = undefined;
        this.timer = window.setTimeout(() => this.discard(), HOLD_MS);
        return true;
    }

    /** The media page takes the clip when it is the same title or the same clip; otherwise it plays its own. */
    adopt(itemId: string, source: string) {
        const clip = this.clip;
        if (!clip) return undefined;
        if (clip.itemId !== itemId && !sameClip(clip.source, source)) {
            this.discard();
            return undefined;
        }
        this.clear();
        return clip;
    }

    /** Takes the stage down once its element sits in the page. */
    private clear() {
        window.clearTimeout(this.timer);
        const stage = this.stage;
        this.clip = undefined;
        this.stage = undefined;
        // The caller moves the element in the same task, so the empty stage never paints.
        if (stage) queueMicrotask(() => stage.remove());
    }

    discard() {
        if (!this.clip) return;
        const { element } = this.clip;
        this.clear();
        this.stop();
        element.remove();
    }
}

export function createPreviewVideo(source: string) {
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'none';
    video.crossOrigin = 'anonymous';
    video.src = source;
    return video;
}

/** The clip grows from where it was on the previous page to its place on the media page. */
export function growFrom(from: DOMRect, region: HTMLElement, video: HTMLVideoElement, onDone: () => void) {
    const to = region.getBoundingClientRect();
    if (!to.width || !to.height || typeof video.animate !== 'function') {
        onDone();
        return () => undefined;
    }
    const scale = Math.max(from.width / to.width, from.height / to.height);
    const x = from.left + from.width / 2 - (to.left + to.width / 2);
    const y = from.top + from.height / 2 - (to.top + to.height / 2);
    const inset = (value: number) => `${Math.max(0, value)}px`;
    const start = `inset(${inset(from.top - to.top)} ${inset(to.right - from.right)} ${inset(to.bottom - from.bottom)} ${inset(from.left - to.left)} round 12px)`;
    const timing = { duration: 450, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' };
    const growth = video.animate([{ transform: `translate(${x}px, ${y}px) scale(${scale})` }, { transform: 'none' }], timing);
    const reveal = region.animate([{ clipPath: start }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }], timing);
    growth.onfinish = onDone;
    return () => {
        growth.onfinish = null;
        growth.cancel();
        reveal.cancel();
    };
}

/**
 * Loads the better variant out of sight, parks it just ahead of the playing clip,
 * and calls `swap` once it runs at the same moment. Gives up quietly on a slow link.
 */
export function prepareUpgrade(source: string, region: HTMLElement, current: () => HTMLVideoElement, swap: (next: HTMLVideoElement) => void) {
    const next = createPreviewVideo(source);
    next.preload = 'auto';
    next.classList.add('is-loading');
    region.appendChild(next);
    let frame = 0;
    let target = 0;
    let tries = 0;
    let lead = 1.2;
    let seekStart = 0;
    let done = false;
    const giveUp = () => {
        done = true;
        cancelAnimationFrame(frame);
        next.removeAttribute('src');
        next.load();
        next.remove();
    };
    const seek = () => {
        if (tries++ >= 4 || current().currentTime + lead >= next.duration - 1) {
            giveUp();
            return;
        }
        target = current().currentTime + lead;
        seekStart = performance.now();
        next.currentTime = target;
    };
    const wait = () => {
        if (done) return;
        const now = current().currentTime;
        if (now >= target) {
            void next.play().catch(giveUp);
            return;
        }
        frame = requestAnimationFrame(wait);
    };
    const seeked = () => {
        if (done) return;
        if (current().currentTime >= target) {
            // Too slow for this margin: leave more room for the next try.
            lead = Math.max(lead * 2, (performance.now() - seekStart) / 1000 + 0.5);
            seek();
            return;
        }
        wait();
    };
    const playing = () => {
        if (done) return;
        done = true;
        next.removeEventListener('seeked', seeked);
        next.classList.remove('is-loading');
        swap(next);
    };
    next.addEventListener('canplay', seek, { once: true });
    next.addEventListener('seeked', seeked);
    next.addEventListener('playing', playing, { once: true });
    next.addEventListener('error', giveUp, { once: true });
    next.load();
    return () => {
        if (!done) giveUp();
    };
}
