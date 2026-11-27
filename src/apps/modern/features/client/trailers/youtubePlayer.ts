const scriptUrl = 'https://www.youtube.com/iframe_api';

export type YouTubePlayer = {
    playVideo: () => void;
    pauseVideo: () => void;
    destroy: () => void;
};

type Event = { target: YouTubePlayer; data: number };
type YouTube = { Player: new (frame: HTMLIFrameElement, options: { events: {
    onReady: () => void;
    onStateChange: (event: Event) => void;
    onError: () => void;
    onAutoplayBlocked: () => void;
} }) => YouTubePlayer };

type YouTubeWindow = Window & { YT?: YouTube; onYouTubeIframeAPIReady?: () => void };
let pending: Promise<YouTube> | undefined;

/** Load the official API when a trailer is opened, sharing any existing embed API. */
export function loadYouTube() {
    const host = window as YouTubeWindow;
    if (host.YT?.Player) return Promise.resolve(host.YT);
    if (pending) return pending;
    pending = new Promise<YouTube>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
        const script = existing || document.createElement('script');
        const previous = host.onYouTubeIframeAPIReady;
        const timeout = window.setTimeout(failed, 12000);
        function cleanup() {
            window.clearTimeout(timeout);
            script.removeEventListener('error', failed);
            if (host.onYouTubeIframeAPIReady === ready) host.onYouTubeIframeAPIReady = previous;
        }
        function failed() {
            cleanup();
            if (!existing) script.remove();
            reject(new Error('YouTube player unavailable'));
        }
        function ready() {
            cleanup();
            if (host.YT?.Player) resolve(host.YT);
            else reject(new Error('YouTube player unavailable'));
            previous?.();
        }
        host.onYouTubeIframeAPIReady = ready;
        script.addEventListener('error', failed);
        if (!existing) {
            script.src = scriptUrl;
            script.async = true;
            document.head.appendChild(script);
        }
    }).catch(error => {
        pending = undefined;
        throw error;
    });
    return pending;
}
