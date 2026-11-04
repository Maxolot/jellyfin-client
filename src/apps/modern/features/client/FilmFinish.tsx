import React, { useEffect, useState } from 'react';

import ClientIcon from './ClientIcon';

export default function FilmFinish({ ticks }: { readonly ticks?: number | null }) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!ticks) return;
        const timer = window.setInterval(() => setNow(Date.now()), 30000);
        return () => window.clearInterval(timer);
    }, [ticks]);
    if (!ticks) return null;
    const finish = new Date(now + ticks / 10000);
    const tomorrow = finish.toDateString() !== new Date(now).toDateString();
    return <span className='client-film-finish'><ClientIcon name='clock' />Se termine {tomorrow ? 'demain ' : ''}à <time dateTime={finish.toISOString()}>{finish.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time></span>;
}
