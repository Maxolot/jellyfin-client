import { useEffect, useState } from 'react';

/** Sample a tiny server thumbnail; CORS failures simply retain a neutral glow. */
export default function useArtworkColor(source: string | undefined) {
    const [color, setColor] = useState('115 139 175');
    useEffect(() => {
        if (!source) return;
        let disposed = false;
        const artwork = new Image();
        artwork.crossOrigin = 'anonymous';
        const url = new URL(source);
        url.searchParams.set('maxWidth', '32');
        artwork.onload = () => {
            if (disposed) return;
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 12;
                canvas.height = 12;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                if (!context) return;
                context.drawImage(artwork, 0, 0, 12, 12);
                const data = context.getImageData(0, 0, 12, 12).data;
                const sum = [0, 0, 0];
                let weight = 0;
                for (let index = 0; index < data.length; index += 4) {
                    const [red, green, blue] = [data[index], data[index + 1], data[index + 2]];
                    const brightness = (red + green + blue) / 3;
                    if (brightness < 35 || brightness > 225) continue;
                    const saturation = (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255 + 0.1;
                    sum[0] += red * saturation;
                    sum[1] += green * saturation;
                    sum[2] += blue * saturation;
                    weight += saturation;
                }
                if (weight) setColor(sum.map(value => Math.round(value / weight)).join(' '));
            } catch { /* A server may prohibit canvas sampling; artwork itself still works. */ }
        };
        artwork.src = url.toString();
        return () => {
            disposed = true;
            artwork.onload = null;
        };
    }, [source]);
    return color;
}
