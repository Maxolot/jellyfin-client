/** One owner at a time, including while a browser is resolving an asynchronous play(). */
export class PreviewPlayback {
    private current?: { video: HTMLVideoElement; lease: number };
    private sequence = 0;

    acquire(video: HTMLVideoElement) {
        if (this.current && this.current.video !== video) this.release(this.current.video, this.current.lease);
        const lease = ++this.sequence;
        this.current = { video, lease };
        video.style.visibility = '';
        return lease;
    }

    owns(video: HTMLVideoElement, lease: number) {
        return this.current?.video === video && this.current.lease === lease;
    }

    release(video: HTMLVideoElement, lease: number) {
        // A late play() result must not stop the same element after it acquired a new lease.
        if (this.current?.video === video && this.current.lease !== lease) return;
        if (this.owns(video, lease)) this.current = undefined;
        video.pause();
        video.style.visibility = 'hidden';
        video.removeAttribute('src');
        video.load();
    }

    stop() {
        if (this.current) this.release(this.current.video, this.current.lease);
    }
}

/** Retry playback without pixel access when a remote host refuses the anonymous CORS request. */
export async function startPreviewVideo(video: HTMLVideoElement, active: () => boolean, mute: () => void) {
    async function play() {
        try {
            await video.play();
        } catch (error) {
            if (!active() || (error as Error)?.name !== 'NotAllowedError' || video.muted) throw error;
            video.muted = true;
            mute();
            await video.play();
        }
    }
    try {
        await play();
        return true;
    } catch {
        const code = video.error?.code;
        const crossOriginFailed = (code === 2 || code === 4) && !!video.crossOrigin
            && new URL(video.src, document.baseURI).origin !== window.location.origin;
        if (!active() || !crossOriginFailed) return false;
    }
    const source = video.src;
    video.removeAttribute('crossorigin');
    video.src = source;
    try {
        await play();
        return true;
    } catch {
        return false;
    }
}
