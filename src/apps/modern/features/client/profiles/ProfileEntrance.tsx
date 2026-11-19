import { useLayoutEffect, type RefObject } from 'react';

import { ARRIVAL_MS, clearOutgoingFlight, flightTransform, mountFlight, reducedMotion, takeEntrance } from './profileEntrance';
import './entrance.scss';

/** Lands the avatar on the actual profile button, even after an account reload. */
export default function ProfileEntrance({ profile }: Readonly<{ profile: RefObject<HTMLButtonElement> }>) {
    useLayoutEffect(() => {
        const pending = takeEntrance();
        const destination = profile.current;
        if (!pending || reducedMotion() || !destination || typeof destination.animate !== 'function') {
            clearOutgoingFlight();
            return;
        }
        const target = destination.getBoundingClientRect();
        const layer = document.createElement('div');
        layer.className = 'client-profile-flight client-profile-flight-incoming';
        layer.setAttribute('aria-hidden', 'true');
        document.body.appendChild(layer);
        const avatar = mountFlight(layer, pending, pending.box);
        clearOutgoingFlight();
        const movement = avatar.animate([
            { transform: 'none', opacity: 1 },
            { opacity: 1, offset: 0.84 },
            { transform: flightTransform(pending.box, target), opacity: 0 }
        ], { duration: ARRIVAL_MS, easing: 'cubic-bezier(0.35, 0.05, 0.18, 1)', fill: 'both' });
        const reveal = destination.animate([
            { opacity: 0 }, { opacity: 0, offset: 0.74 }, { opacity: 1 }
        ], { duration: ARRIVAL_MS, fill: 'both' });
        const done = () => {
            layer.remove();
            reveal.cancel();
        };
        movement.finished.then(done, done);
        return () => {
            movement.cancel();
            done();
        };
    }, [profile]);
    return null;
}
