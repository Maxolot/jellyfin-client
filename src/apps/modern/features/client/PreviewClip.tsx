/* eslint-disable react/jsx-no-bind -- Preview controls belong to their own short-lived surface. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useEffect, useId, useRef, useState } from 'react';

import ClientIcon from './ClientIcon';
import { usePreviews } from './PreviewProvider';
import { previewSource, type PreviewSurface } from './previewSource';

type Props = { item: BaseItemDto; surface: PreviewSurface; enabled?: boolean; soundControl?: boolean };
const priority = { hero: 0, spotlight: 1, detail: 5, card: 10, episode: 20 };

export default function PreviewClip({ item, surface, enabled = true, soundControl = true }: Readonly<Props>) {
    const preview = usePreviews();
    const generatedId = useId();
    const owner = `${preview?.scope || ''}:${generatedId}`;
    const region = useRef<HTMLSpanElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const [visible, setVisible] = useState(false);
    const [nearby, setNearby] = useState(false);
    const [started, setStarted] = useState(false);
    const [fading, setFading] = useState(false);
    const source = preview ? previewSource(preview.sources, item, document.baseURI, surface !== 'episode', surface) : undefined;
    const key = `${surface}:${item.Id}:${source}`;
    const claim = preview?.claim;
    const release = preview?.release;
    const report = preview?.report;
    const completed = preview?.completed;
    const mute = preview?.mute;
    const available = !!source && enabled && !!preview?.enabled;
    useEffect(() => {
        if (!available || !region.current || !('IntersectionObserver' in window)) return;
        const observer = new IntersectionObserver(entries => setNearby(entries.some(entry => entry.isIntersecting)), { threshold: 0.1 });
        observer.observe(region.current);
        return () => observer.disconnect();
    }, [available]);
    useEffect(() => {
        if (!available || !nearby) return;
        claim?.(owner, priority[surface]);
        return () => release?.(owner);
    }, [available, nearby, claim, release, owner, surface]);
    const active = available && nearby && preview?.selected === owner;
    useEffect(() => {
        setStarted(false);
        setVisible(false);
        setFading(false);
        if (!active || completed?.has(key)) return;
        const timer = window.setTimeout(() => setStarted(true), 1100);
        return () => window.clearTimeout(timer);
    }, [active, key, completed]);
    useEffect(() => {
        if (video.current) video.current.muted = preview?.muted !== false;
    }, [preview?.muted, started]);
    useEffect(() => {
        const element = video.current;
        if (!started || !element || !source) return;
        let disposed = false;
        let frame = 0;
        let finishTimer = 0;
        let fadeStarted = false;
        let finishing = false;
        report?.(owner, true);
        const finish = () => {
            if (finishing) return;
            finishing = true;
            element.pause();
            completed?.add(key);
            setFading(true);
            finishTimer = window.setTimeout(() => {
                if (!disposed) {
                    setStarted(false);
                    setVisible(false);
                }
            }, 850);
        };
        const fadeVolume = () => {
            const remaining = element.duration - element.currentTime;
            element.volume = Math.max(0, Math.min(1, remaining / 0.8));
            if (!disposed && !element.ended && remaining > 0) frame = requestAnimationFrame(fadeVolume);
        };
        const progress = () => {
            if (!fadeStarted && Number.isFinite(element.duration) && element.duration - element.currentTime <= 0.8) {
                fadeStarted = true;
                setFading(true);
                frame = requestAnimationFrame(fadeVolume);
            }
        };
        const ready = () => setVisible(true);
        const metadata = () => {
            // A preview registry cannot silently turn a whole film into an autoplay source.
            if (!Number.isFinite(element.duration) || element.duration > 30) finish();
        };
        element.addEventListener('playing', ready);
        element.addEventListener('loadedmetadata', metadata);
        element.addEventListener('timeupdate', progress);
        element.addEventListener('ended', finish);
        element.addEventListener('error', finish);
        void element.play().catch(error => {
            if (disposed) return;
            if (error?.name === 'NotAllowedError') {
                element.muted = true;
                mute?.();
                return element.play().catch(() => {
                    if (!disposed) finish();
                });
            }
            finish();
        });
        return () => {
            disposed = true;
            report?.(owner, false);
            window.clearTimeout(finishTimer);
            cancelAnimationFrame(frame);
            element.removeEventListener('playing', ready);
            element.removeEventListener('loadedmetadata', metadata);
            element.removeEventListener('timeupdate', progress);
            element.removeEventListener('ended', finish);
            element.removeEventListener('error', finish);
            element.pause();
            element.removeAttribute('src');
            element.load();
        };
    }, [started, source, key, completed, owner, report, mute]);
    if (!source || !preview) return null;
    return <><span ref={region} className={`client-preview-media${visible && !fading ? ' is-playing' : ''}${fading ? ' is-fading' : ''}`} aria-hidden='true'>
        {started && <video ref={video} src={source} muted playsInline preload='none' />}
    </span>{soundControl && visible && !fading && <button className={`client-preview-sound client-preview-sound-${surface}`} aria-label={preview.muted ? 'Activer le son des aperçus' : 'Couper le son des aperçus'} aria-pressed={!preview.muted} onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        preview.toggleMuted();
    }}><ClientIcon name={preview.muted ? 'muted' : 'volume'} /></button>}</>;
}
/* eslint-enable react/jsx-no-bind */
