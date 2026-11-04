import React, { useEffect, useState } from 'react';

import HeroArtwork from './HeroArtwork';

/** Retain the last frame while the whole ambient surface fades out. */
export default function AmbientBackdrop({ source }: { readonly source: string }) {
    const [last, setLast] = useState(source);
    useEffect(() => {
        if (source) setLast(source);
    }, [source]);
    return <div className={`client-ambient${source ? ' is-active' : ''}`} aria-hidden='true'>{last && <HeroArtwork source={last} fadeMs={1600} />}</div>;
}
