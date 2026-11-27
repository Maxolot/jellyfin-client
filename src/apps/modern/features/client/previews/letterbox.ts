type Bars = { top: number; bottom: number };

/** Detect only stable, roughly symmetric black bars; never infer side crops. */
export function detectLetterbox(pixels: Uint8ClampedArray, width: number, height: number): Bars | undefined {
    if (width < 16 || height < 16 || pixels.length !== width * height * 4) return undefined;
    const dark = (row: number) => {
        let bright = 0;
        for (let x = 0; x < width; x += 2) {
            const i = (row * width + x) * 4;
            if (pixels[i] > 22 || pixels[i + 1] > 22 || pixels[i + 2] > 22) bright++;
        }
        return bright < Math.ceil(width / 2 * 0.025);
    };
    let top = 0;
    let bottom = 0;
    while (top < height / 4 && dark(top)) top++;
    while (bottom < height / 4 && dark(height - 1 - bottom)) bottom++;
    if (top < height * 0.035 || bottom < height * 0.035 || top >= height / 4 || bottom >= height / 4 || Math.abs(top - bottom) > height * 0.06) return undefined;
    let litRows = 0;
    for (let y = top; y < height - bottom; y++) if (!dark(y)) litRows++;
    if (litRows < height * 0.35) return undefined;
    return { top: top / height, bottom: bottom / height };
}

/** Avoid treating a fade from black as evidence that the video has no bars. */
export function frameHasContent(pixels: Uint8ClampedArray, width: number, height: number): boolean {
    if (width < 16 || height < 16 || pixels.length !== width * height * 4) return false;
    let bright = 0;
    for (let y = Math.floor(height / 4); y < Math.floor(height * 3 / 4); y += 4) {
        for (let x = 0; x < width; x += 4) {
            const i = (y * width + x) * 4;
            if (pixels[i] > 22 || pixels[i + 1] > 22 || pixels[i + 2] > 22) bright++;
            if (bright >= 8) return true;
        }
    }
    return false;
}

/** Scale only as much as necessary for the picture between the bars to fill the box. */
export function letterboxTransform(videoWidth: number, videoHeight: number, boxWidth: number, boxHeight: number, bars: Bars) {
    if (![videoWidth, videoHeight, boxWidth, boxHeight].every(value => Number.isFinite(value) && value > 0)) return '';
    const fraction = 1 - bars.top - bars.bottom;
    if (fraction <= 0 || bars.top < 0 || bars.bottom < 0) return '';
    const base = Math.max(boxWidth / videoWidth, boxHeight / videoHeight);
    const target = Math.max(boxWidth / videoWidth, boxHeight / (videoHeight * fraction));
    const zoom = Math.min(2, Math.max(1, target / base));
    const shift = (bars.bottom - bars.top) * videoHeight * base * zoom / 2;
    return `translateY(${shift.toFixed(2)}px) scale(${zoom.toFixed(4)})`;
}

/** Read decoded frames from a playable video; inaccessible pixels leave the usual cover. */
export function inspectPreviewLetterbox(video: HTMLVideoElement, complete: (bars?: Bars) => void) {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let timer = 0;
    let checks = 0;
    let previous: Bars | undefined;
    let stableFrames = 0;
    let cleanFrames = 0;
    const maxChecks = Number.isFinite(video.duration) && video.duration < 5 ? 3 : 8;
    const measure = () => {
        if (!context || !video.videoWidth || checks++ >= maxChecks) {
            complete();
            return;
        }
        try {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            const bars = detectLetterbox(pixels, canvas.width, canvas.height);
            const matches = bars && previous && Math.abs(bars.top - previous.top) < 0.025 && Math.abs(bars.bottom - previous.bottom) < 0.025;
            stableFrames = matches ? stableFrames + 1 : Number(!!bars);
            previous = bars;
            cleanFrames = !bars && frameHasContent(pixels, canvas.width, canvas.height) ? cleanFrames + 1 : 0;
            // One sample row covers the antialiased boundary between the picture and each bar.
            if (bars && stableFrames >= 3) complete({ top: bars.top + 1 / canvas.height, bottom: bars.bottom + 1 / canvas.height });
            else if (cleanFrames >= 3) complete();
            else timer = window.setTimeout(measure, 250);
        } catch {
            complete();
        }
    };
    timer = window.setTimeout(measure, 100);
    return () => window.clearTimeout(timer);
}
