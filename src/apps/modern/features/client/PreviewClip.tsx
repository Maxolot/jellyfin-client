/* eslint-disable react/jsx-no-bind -- Preview controls belong to their own short-lived surface. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import useMediaQuery from '@mui/material/useMediaQuery';
import { useServerPreview } from './previews/provider';
import { compactPreview } from './previews/model';
import { createPreviewVideo, growFrom, prepareUpgrade, sameFile, type HandedClip } from './previews/handoff';
import { detectLetterbox, frameHasContent, letterboxTransform } from './previews/letterbox';
import ClientIcon from './ClientIcon';
import { usePreviews } from './PreviewProvider';
import { previewSource, type PreviewSurface } from './previewSource';

type Props = { item: BaseItemDto; surface: PreviewSurface; enabled?: boolean; soundControl?: boolean };
const priority = { hero: 0, spotlight: 1, detail: 5, card: 10, episode: 20 };

// eslint-disable-next-line sonarjs/cognitive-complexity -- Source ownership combines static and optional server-backed previews.
export default function PreviewClip({ item, surface, enabled = true, soundControl = true }: Readonly<Props>) {
    const preview = usePreviews();
    const generatedId = useId();
    const owner = `${preview?.scope || ''}:${generatedId}`;
    const region = useRef<HTMLSpanElement>(null);
    const video = useRef<HTMLVideoElement>();
    const [visible, setVisible] = useState(false);
    const [nearby, setNearby] = useState(false);
    const [startedKey, setStartedKey] = useState<string>();
    const [fading, setFading] = useState(false);
    const staticSource = preview ? previewSource(preview.sources, item, document.baseURI, surface !== 'episode', surface) : undefined;
    const key = `${surface}:${item.Id}`;
    const started = startedKey === key;
    const small = useMediaQuery('(max-width: 700px)');
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    const claim = preview?.claim;
    const release = preview?.release;
    const report = preview?.report;
    const completed = preview?.completed;
    const mute = preview?.mute;
    const playback = preview?.playback;
    const handoff = preview?.handoff;
    const [resuming, setResuming] = useState(false);
    const available = (!!staticSource || !!preview?.serverAvailable) && enabled && !!preview?.enabled;
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
    const [resolve, setResolve] = useState(false);
    useEffect(() => {
        setResolve(false);
        if (!active || completed?.has(key)) return;
        // A clip carried over from the previous page does not wait for the usual hover delay.
        const timer = window.setTimeout(() => setResolve(true), surface === 'detail' && handoff?.pending() ? 0 : 600);
        return () => window.clearTimeout(timer);
    }, [active, completed, key, surface, handoff]);
    const server = useServerPreview(item, surface, active && resolve && !!preview?.serverAvailable && !completed?.has(key));
    let source = staticSource;
    if (preview?.serverAvailable) {
        if (server.data?.state === 'ready') source = compactPreview(surface, small, saveData) ? server.data.compact || server.data.full : server.data.full || server.data.compact;
        else if (server.isPending || server.data?.state === 'pending') source = undefined;
    }
    useEffect(() => {
        setStartedKey(undefined);
        setVisible(false);
        setFading(false);
        if (!active || completed?.has(key)) return;
        const timer = window.setTimeout(() => setStartedKey(key), surface === 'detail' && handoff?.pending() ? 0 : 1100);
        return () => window.clearTimeout(timer);
    }, [active, key, completed, surface, handoff]);
    // Read by the cleanups below, which run with the props of the page being left.
    const nextSurface = useRef(surface);
    nextSurface.current = surface;
    const unmounting = useRef(false);
    const handedOver = useRef<HTMLVideoElement>();
    const adopted = useRef<HandedClip>();
    useLayoutEffect(() => () => {
        unmounting.current = true;
    }, []);
    // The element lives outside React so that the same playing video can change page.
    useLayoutEffect(() => {
        if (!active || !started || !source || !region.current) return;
        const place = region.current;
        const clip = surface === 'detail' && item.Id ? handoff?.adopt(item.Id, source) : undefined;
        const element = clip?.element || createPreviewVideo(source);
        adopted.current = clip;
        if (clip) setResuming(true);
        place.appendChild(element);
        video.current = element;
        return () => {
            const leaving = unmounting.current || (surface !== 'detail' && nextSurface.current === 'detail');
            const current = video.current || element;
            video.current = undefined;
            const handed = leaving && surface !== 'episode' && !current.paused && !current.ended && !!item.Id
                && handoff?.hand({ itemId: item.Id, source, element: current, from: place.getBoundingClientRect() }, [item.Id, item.SeriesId]);
            if (handed) handedOver.current = current;
            else current.remove();
        };
    }, [active, started, source, surface, item.Id, item.SeriesId, handoff]);
    useEffect(() => {
        if (video.current) video.current.muted = preview?.muted !== false;
    }, [preview?.muted, started, source]);
    useEffect(() => {
        const first = video.current;
        const place = region.current;
        if (!active || !started || !first || !source || !playback || !place) return;
        let element = first;
        let lease = playback.acquire(element);
        const clip = adopted.current;
        adopted.current = undefined;
        let stopGrowing = () => undefined as void;
        let stopUpgrade = () => undefined as void;
        let disposed = false;
        let frame = 0;
        let revealFrame = 0;
        let finishTimer = 0;
        let fadeStarted = false;
        let finishing = false;
        let frameTimer = 0;
        let checks = 0;
        let lastBars: { top: number; bottom: number } | undefined;
        let stable = 0;
        let cleanFrames = 0;
        let inspectionStarted = false;
        let measured: { top: number; bottom: number } | undefined;
        const canvas = surface === 'hero' ? document.createElement('canvas') : undefined;
        if (canvas) {
            canvas.width = 160;
            canvas.height = 90;
        }
        const applyFraming = () => {
            if (!measured || !element.parentElement) return;
            const bounds = element.parentElement.getBoundingClientRect();
            element.style.transform = letterboxTransform(element.videoWidth, element.videoHeight, bounds.width, bounds.height, measured);
        };
        const reveal = () => {
            if (disposed || finishing || !playback.owns(element, lease)) return;
            setVisible(true);
            if (surface !== 'hero') {
                element.volume = 1;
                return;
            }
            let remaining = 15;
            const releaseAudio = () => {
                if (disposed || finishing || !playback.owns(element, lease)) return;
                if (element.parentElement?.classList.contains('is-playing')) element.volume = 1;
                else if (remaining-- > 0) revealFrame = requestAnimationFrame(releaseAudio);
            };
            revealFrame = requestAnimationFrame(releaseAudio);
        };
        const measureBars = () => {
            if (disposed || !playback.owns(element, lease)) return;
            const maxChecks = Number.isFinite(element.duration) && element.duration < 5 ? 3 : 8;
            if (!canvas || !element.videoWidth || checks++ >= maxChecks) {
                reveal();
                return;
            }
            try {
                const context = canvas.getContext('2d', { willReadFrequently: true });
                if (!context) {
                    reveal();
                    return;
                }
                context.drawImage(element, 0, 0, canvas.width, canvas.height);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                const bars = detectLetterbox(pixels, canvas.width, canvas.height);
                if (bars && lastBars && Math.abs(bars.top - lastBars.top) < 0.025 && Math.abs(bars.bottom - lastBars.bottom) < 0.025) stable++;
                else stable = 0;
                lastBars = bars;
                cleanFrames = !bars && frameHasContent(pixels, canvas.width, canvas.height) ? cleanFrames + 1 : 0;
                if (bars && stable >= 2) {
                    measured = bars;
                    applyFraming();
                    reveal();
                    return;
                }
                if (cleanFrames >= 3) {
                    reveal();
                    return;
                }
                frameTimer = window.setTimeout(measureBars, 250);
            } catch {
                // Cross-origin or unreadable video keeps the normal cover framing.
                reveal();
            }
        };
        window.addEventListener('resize', applyFraming);
        if (surface === 'hero') element.volume = 0;
        report?.(owner, true);
        const finish = () => {
            if (finishing || disposed || !playback.owns(element, lease)) return;
            finishing = true;
            element.pause();
            completed?.add(key);
            setFading(true);
            finishTimer = window.setTimeout(() => {
                if (!disposed) {
                    setStartedKey(undefined);
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
            if (element.currentTime >= 30) {
                finish();
                return;
            }
            if (!fadeStarted && Number.isFinite(element.duration) && element.duration - element.currentTime <= 0.8) {
                fadeStarted = true;
                setFading(true);
                frame = requestAnimationFrame(fadeVolume);
            }
        };
        const ready = () => {
            if (disposed || !playback.owns(element, lease)) {
                playback.release(element, lease);
                return;
            }
            if (surface !== 'hero') {
                reveal();
            } else if (!inspectionStarted) {
                inspectionStarted = true;
                frameTimer = window.setTimeout(measureBars, 100);
            }
        };
        const metadata = () => {
            // A preview registry cannot silently turn a whole film into an autoplay source.
            if (!Number.isFinite(element.duration) || element.duration > 30.5) finish();
        };
        function cleanupPlayback() {
            disposed = true;
            stopGrowing();
            stopUpgrade();
            setResuming(false);
            report?.(owner, false);
            window.clearTimeout(finishTimer);
            window.clearTimeout(frameTimer);
            window.removeEventListener('resize', applyFraming);
            element.style.transform = '';
            cancelAnimationFrame(frame);
            cancelAnimationFrame(revealFrame);
            detach(element);
            // A clip on its way to the media page keeps playing.
            if (handedOver.current === element) handedOver.current = undefined;
            else playback?.release(element, lease);
        }
        const attach = (target: HTMLVideoElement) => {
            target.addEventListener('playing', ready);
            target.addEventListener('loadedmetadata', metadata);
            target.addEventListener('timeupdate', progress);
            target.addEventListener('ended', finish);
            target.addEventListener('error', finish);
        };
        const detach = (target: HTMLVideoElement) => {
            target.removeEventListener('playing', ready);
            target.removeEventListener('loadedmetadata', metadata);
            target.removeEventListener('timeupdate', progress);
            target.removeEventListener('ended', finish);
            target.removeEventListener('error', finish);
        };
        attach(element);
        if (clip) {
            // The same video carries on: it only needs to reach its place, then its best quality.
            if (element.paused) void element.play().catch(() => undefined);
            stopGrowing = growFrom(clip.from, place, element, () => {
                reveal();
                if (sameFile(element.currentSrc || element.src, source)) return;
                stopUpgrade = prepareUpgrade(source, place, () => element, next => {
                    const previous = element;
                    next.volume = previous.volume;
                    next.muted = previous.muted;
                    detach(previous);
                    element = next;
                    video.current = next;
                    lease = playback.acquire(next);
                    attach(next);
                    previous.remove();
                    if (next.paused) void next.play().catch(() => finish());
                });
            });
            return cleanupPlayback;
        }
        void element.play().then(() => {
            if (disposed || !playback.owns(element, lease)) playback.release(element, lease);
        }).catch(error => {
            if (disposed || !playback.owns(element, lease)) return;
            if (error?.name === 'NotAllowedError') {
                element.muted = true;
                mute?.();
                return element.play().then(() => {
                    if (disposed || !playback.owns(element, lease)) playback.release(element, lease);
                }).catch(() => {
                    if (!disposed && playback.owns(element, lease)) finish();
                });
            }
            finish();
        });
        return cleanupPlayback;
    }, [active, started, source, key, completed, owner, report, mute, playback, surface]);
    if (!available || !preview) return null;
    return <><span ref={region} className={`client-preview-media${visible && !fading ? ' is-playing' : ''}${fading ? ' is-fading' : ''}${resuming ? ' is-resuming' : ''}`} aria-hidden='true' />{soundControl && visible && !fading && <button className={`client-preview-sound client-preview-sound-${surface}`} aria-label={preview.muted ? 'Activer le son des aperçus' : 'Couper le son des aperçus'} aria-pressed={!preview.muted} onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        preview.toggleMuted();
    }}><ClientIcon name={preview.muted ? 'muted' : 'volume'} /></button>}</>;
}
/* eslint-enable react/jsx-no-bind */
