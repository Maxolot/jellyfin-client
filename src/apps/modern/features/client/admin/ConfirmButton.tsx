import React, { useCallback, useEffect, useState } from 'react';

const ARMED_MS = 5000;

/** An action that needs a second press, written in place: no dialog, and it disarms itself after a few seconds. */
export default function ConfirmButton({ label, confirm, busy, danger = true, onConfirm }: Readonly<{ label: string; confirm: string; busy?: boolean; danger?: boolean; onConfirm: () => void }>) {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed) return;
        const timer = setTimeout(() => setArmed(false), ARMED_MS);
        return () => clearTimeout(timer);
    }, [armed]);
    const press = useCallback(() => {
        if (!armed) {
            setArmed(true);
            return;
        }
        setArmed(false);
        onConfirm();
    }, [armed, onConfirm]);
    let text = armed ? confirm : label;
    if (busy) text = 'Envoi…';
    return <button type='button' className={`client-settings-button${danger && armed ? ' client-settings-button-danger' : ''}`} disabled={busy} aria-live='polite' onClick={press}>
        {text}
    </button>;
}
