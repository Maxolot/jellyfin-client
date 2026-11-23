import React, { type CSSProperties, useEffect, useState } from 'react';

type Loaded = { source: string; src: string; ratio: number } | { source: string; failed: true };

const SAMPLE_WIDTH = 256;
const ALPHA_THRESHOLD = 12;

/** Bounds of the visible pixels, measured on a small copy, in natural pixels. */
function opaqueRows(data: Uint8ClampedArray, width: number, height: number) {
    const rows: number[] = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
                rows.push(y);
                break;
            }
        }
    }
    return rows;
}

function opaqueColumns(data: Uint8ClampedArray, width: number, height: number) {
    const columns: number[] = [];
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
                columns.push(x);
                break;
            }
        }
    }
    return columns;
}

/** Bounds of the visible pixels, measured on a small copy, in natural pixels. */
export function visibleBounds(data: Uint8ClampedArray, width: number, height: number, scale: number) {
    const rows = opaqueRows(data, width, height);
    const columns = opaqueColumns(data, width, height);
    if (!rows.length || !columns.length) return null;
    const top = rows[0];
    const left = columns[0];
    return { x: left / scale, y: top / scale, width: (columns[columns.length - 1] - left + 1) / scale, height: (rows[rows.length - 1] - top + 1) / scale };
}

/** Logos often ship with wide transparent margins: crop them so the drawing fills its box. */
function trimmed(image: HTMLImageElement): HTMLCanvasElement | null {
    const scale = Math.min(1, SAMPLE_WIDTH / image.naturalWidth);
    const sample = document.createElement('canvas');
    sample.width = Math.max(1, Math.round(image.naturalWidth * scale));
    sample.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = sample.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, sample.width, sample.height);
    // Throws on a cross-origin image: the untrimmed logo is kept.
    const bounds = visibleBounds(context.getImageData(0, 0, sample.width, sample.height).data, sample.width, sample.height, scale);
    if (!bounds) return null;
    const margin = 2 / scale;
    const x = Math.max(0, bounds.x - margin);
    const y = Math.max(0, bounds.y - margin);
    const width = Math.min(image.naturalWidth - x, bounds.width + margin * 2);
    const height = Math.min(image.naturalHeight - y, bounds.height + margin * 2);
    // Nothing worth cropping.
    if (width * height > image.naturalWidth * image.naturalHeight * 0.92) return null;
    const output = document.createElement('canvas');
    output.width = Math.round(width);
    output.height = Math.round(height);
    output.getContext('2d')?.drawImage(image, x, y, width, height, 0, 0, output.width, output.height);
    return output;
}

/** Title logo sized by the proportions of its visible drawing, see .client-title-logo. */
export default function TitleLogo({ source }: Readonly<{ source: string }>) {
    const [loaded, setLoaded] = useState<Loaded>();
    useEffect(() => {
        let cancelled = false;
        let objectUrl = '';
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.decoding = 'async';
        image.onload = () => {
            if (cancelled) return;
            let canvas: HTMLCanvasElement | null = null;
            try {
                canvas = trimmed(image);
            } catch { /* Cross-origin or unreadable image: shown as is. */ }
            if (!canvas) {
                setLoaded({ source, src: source, ratio: image.naturalWidth / image.naturalHeight });
                return;
            }
            const ratio = canvas.width / canvas.height;
            canvas.toBlob(blob => {
                if (cancelled) return;
                if (!blob) {
                    setLoaded({ source, src: source, ratio: image.naturalWidth / image.naturalHeight });
                    return;
                }
                objectUrl = URL.createObjectURL(blob);
                setLoaded({ source, src: objectUrl, ratio });
            }, 'image/png');
        };
        image.onerror = () => {
            if (!cancelled) setLoaded({ source, failed: true });
        };
        image.src = source;
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [source]);
    const current = loaded?.source === source ? loaded : undefined;
    if (current && 'failed' in current) return null;
    return <img className={`client-artwork client-title-logo${current ? ' artwork-ready' : ''}`} alt='' src={current?.src}
        style={current ? { '--logo-ratio': current.ratio.toFixed(3) } as CSSProperties : undefined} />;
}
