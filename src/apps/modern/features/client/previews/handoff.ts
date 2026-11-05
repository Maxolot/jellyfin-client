/** Where a clip stopped when its page was left, so the media page can carry on from the same moment. */
export type PreviewResume = { itemId: string; source: string; time: number; at: number; frame?: HTMLCanvasElement };

const WINDOW_MS = 3000;

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

export class PreviewHandoff {
    private entry?: PreviewResume;

    save(entry: PreviewResume) {
        this.entry = entry;
    }

    /** A clip stopped moments ago: the next page may be its continuation, so it should not wait. */
    fresh(now = Date.now()) {
        return !!this.entry && now - this.entry.at <= WINDOW_MS;
    }

    /** Gives the resume point once, only to the same title or the same clip. */
    take(itemId: string, source: string, now = Date.now()) {
        const entry = this.entry;
        if (!entry || now - entry.at > WINDOW_MS) return undefined;
        if (entry.itemId !== itemId && !sameClip(entry.source, source)) return undefined;
        this.entry = undefined;
        return entry;
    }
}

/** The last picture shown, held over the media page until the next video has its first frame. */
export function captureFrame(video: HTMLVideoElement) {
    if (!video.videoWidth || video.readyState < 2) return undefined;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(960, video.videoWidth);
        canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.className = 'client-preview-bridge';
        return canvas;
    } catch {
        return undefined;
    }
}
