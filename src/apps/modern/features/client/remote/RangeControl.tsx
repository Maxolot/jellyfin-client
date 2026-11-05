import React, { useCallback, useEffect, useRef, useState } from 'react';

type Props = { label: string; value: number; max: number; step: number; text: string; onChange: (value: number) => void; className?: string };

/** A drawn slider: pointer, touch and keyboard, without the browser's own look. */
/* eslint-disable react/jsx-no-bind -- Pointer completion handlers share the draft of this control. */
export default function RangeControl({ label, value, max, step, text, onChange, className = '' }: Readonly<Props>) {
    const track = useRef<HTMLDivElement>(null);
    const draft = useRef(value);
    const dragging = useRef(false);
    const [display, setDisplay] = useState(value);
    useEffect(() => {
        if (!dragging.current) {
            draft.current = value;
            setDisplay(value);
        }
    }, [value]);
    const preview = useCallback((next: number) => {
        draft.current = Math.max(0, Math.min(max, next));
        setDisplay(draft.current);
    }, [max]);
    const share = max > 0 ? Math.max(0, Math.min(1, display / max)) : 0;
    const fromPointer = useCallback((clientX: number) => {
        const box = track.current?.getBoundingClientRect();
        if (!box?.width) return;
        preview(Math.max(0, Math.min(1, (clientX - box.left) / box.width)) * max);
    }, [max, preview]);
    const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        fromPointer(event.clientX);
    }, [fromPointer]);
    const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (dragging.current) fromPointer(event.clientX);
    }, [fromPointer]);
    const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        const moves: Record<string, number> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: step * 5, PageDown: -step * 5 };
        if (event.key === 'Home') preview(0);
        else if (event.key === 'End') preview(max);
        else if (event.key in moves) preview(draft.current + moves[event.key]);
        else return;
        onChange(draft.current);
        event.preventDefault();
        event.stopPropagation();
    }, [max, onChange, preview, step]);
    return <div ref={track} className={`client-range ${className}`} role='slider' tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(display)} aria-valuetext={text}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => {
            if (dragging.current) onChange(draft.current);
            dragging.current = false;
        }} onPointerCancel={() => {
            dragging.current = false;
            preview(value);
        }} onKeyDown={onKeyDown}>
        <span className='client-range-track'><span className='client-range-fill' style={{ width: `${share * 100}%` }} /><span className='client-range-thumb' style={{ left: `${share * 100}%` }} /></span>
    </div>;
}

/* eslint-enable react/jsx-no-bind */
