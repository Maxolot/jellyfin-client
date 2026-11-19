export type Avatar = { image?: string; letter: string; tone?: string };
type FlightBox = { left: number; top: number; width: number; height: number };
type Entrance = Avatar & { box: FlightBox };

const KEY = 'client-profile-entrance';
const OUTGOING = 'client-profile-flight-outgoing';
const DEPARTURE_MS = 310;
export const ARRIVAL_MS = 490;

export function reducedMotion() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function flightTransform(from: FlightBox, to: FlightBox) {
    return `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`;
}

export function avatarBox(tile?: HTMLElement) {
    return tile?.querySelector('.client-profile-avatar')?.getBoundingClientRect();
}

function validBox(box: FlightBox | undefined): box is FlightBox {
    return !!box && [box.left, box.top, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0;
}

export function mountFlight(parent: HTMLElement, avatar: Avatar, box: FlightBox) {
    const element = document.createElement('span');
    element.className = 'client-profile-flight-avatar';
    Object.assign(element.style, {
        left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
        fontSize: `${box.height * 0.43}px`, backgroundColor: avatar.tone
    });
    if (avatar.image) {
        const image = document.createElement('img');
        image.src = avatar.image;
        image.alt = '';
        element.appendChild(image);
    } else {
        element.textContent = avatar.letter;
    }
    parent.appendChild(element);
    return element;
}

export function clearOutgoingFlight() {
    document.getElementById(OUTGOING)?.remove();
    document.querySelector('.client-profiles-leaving')?.classList.remove('client-profiles-leaving');
    document.querySelector('.client-profile-flight-source')?.classList.remove('client-profile-flight-source');
}

export async function leaveProfiles(tile: HTMLElement | undefined, avatar: Avatar, from = avatarBox(tile)) {
    clearOutgoingFlight();
    if (!validBox(from) || reducedMotion() || typeof HTMLElement.prototype.animate !== 'function') return;
    const side = Math.min(190, Math.max(from.width, from.height) * 1.12);
    const box = { left: (window.innerWidth - side) / 2, top: (window.innerHeight - side) / 2, width: side, height: side };
    try {
        sessionStorage.setItem(KEY, JSON.stringify({ ...avatar, box, at: Date.now() }));
    } catch { return; }

    const layer = document.createElement('div');
    layer.id = OUTGOING;
    layer.className = 'client-profile-flight';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    const avatarElement = mountFlight(layer, avatar, from);
    tile?.classList.add('client-profile-flight-source');
    document.querySelector('.client-profiles')?.classList.add('client-profiles-leaving');
    const animation = avatarElement.animate([
        { transform: 'none' },
        { transform: flightTransform(from, box) }
    ], { duration: DEPARTURE_MS, easing: 'cubic-bezier(0.22, 0.8, 0.22, 1)', fill: 'forwards' });
    // The destination removes this layer on an in-app navigation. Expire it if navigation is interrupted.
    window.setTimeout(() => {
        if (layer.isConnected) clearOutgoingFlight();
    }, 5000);
    await animation.finished.catch(() => undefined);
}

export function takeEntrance(): Entrance | undefined {
    try {
        const raw = sessionStorage.getItem(KEY);
        sessionStorage.removeItem(KEY);
        const value = JSON.parse(raw || 'null') as (Entrance & { at?: number }) | null;
        if (!value || typeof value.letter !== 'string' || !value.at || Date.now() - value.at > 20000 || !validBox(value.box)) return undefined;
        return { image: typeof value.image === 'string' ? value.image : undefined, letter: value.letter,
            tone: typeof value.tone === 'string' ? value.tone : undefined, box: value.box };
    } catch {
        return undefined;
    }
}
