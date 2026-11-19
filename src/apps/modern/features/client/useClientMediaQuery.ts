import { useEffect, useState } from 'react';

function mediaQuery(query: string) {
    return typeof matchMedia === 'function' ? matchMedia(query) : undefined;
}

/** Do not require the dashboard UI library for browser media preferences. */
export default function useClientMediaQuery(query: string) {
    const [matches, setMatches] = useState(() => mediaQuery(query)?.matches || false);
    useEffect(() => {
        const media = mediaQuery(query);
        if (!media) return;
        const update = () => setMatches(media.matches);
        update();
        if (media.addEventListener) {
            media.addEventListener('change', update);
            return () => media.removeEventListener('change', update);
        }
        media.addListener(update);
        return () => media.removeListener(update);
    }, [query]);
    return matches;
}
