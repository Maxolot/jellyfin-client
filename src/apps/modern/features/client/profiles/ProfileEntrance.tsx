import React, { useEffect, useState } from 'react';

import { reducedMotion, takeEntrance, type Entrance } from './profileEntrance';
import './entrance.scss';

/** Covers the home page with the chosen avatar, then lets it grow and dissolve to reveal the page underneath. */
export default function ProfileEntrance() {
    const [entrance, setEntrance] = useState<Entrance | undefined>(() => {
        // Always consumed, so that the next visit to the home page does not replay it.
        const pending = takeEntrance();
        return reducedMotion() ? undefined : pending;
    });
    useEffect(() => {
        if (!entrance) return;
        document.documentElement.classList.add('client-entering-profile');
        const timer = window.setTimeout(() => setEntrance(undefined), 1300);
        return () => {
            window.clearTimeout(timer);
            document.documentElement.classList.remove('client-entering-profile');
        };
    }, [entrance]);
    if (!entrance) return null;
    return <div className='client-profile-entrance' aria-hidden='true'>
        <span className='client-profile-entrance-avatar' style={{ background: entrance.image ? undefined : entrance.tone }}>
            {entrance.image ? <img src={entrance.image} alt='' /> : entrance.letter}
        </span>
    </div>;
}
