/* eslint-disable react/jsx-no-bind -- Preview controls belong to their own short-lived surface. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import useClientMediaQuery from './useClientMediaQuery';
import { useServerPreview } from './previews/provider';
import { compactPreview } from './previews/model';
import { createPreviewVideo, growFrom, prepareUpgrade, sameFile, type HandedClip } from './previews/handoff';
import { inspectPreviewLetterbox, letterboxTransform } from './previews/letterbox';
import { startPreviewVideo } from './previews/playback';
import ClientIcon from './ClientIcon';
import { useEpisodeSpoilers } from './spoilers';
import { usePreviews } from './PreviewProvider';
import { previewSource, type PreviewSurface } from './previewSource';

type Props = { item: BaseItemDto; surface: PreviewSurface; enabled?: boolean; soundControl?: boolean };
const priority = { hero: 0, spotlight: 1, detail: 5, card: 10, episode: 20 };

// eslint-disable-next-line sonarjs/cognitive-complexity -- Source ownership combines static and optional server-backed previews.
export default function PreviewClip({ item, surface, enabled = true, soundControl = true }: Readonly<Props>) {
    const preview = usePreviews();
    const protect = useEpisodeSpoilers();
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
    const small = useClientMediaQuery('(max-width: 700px)');
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    const claim = preview?.claim;
    const release = preview?.release;
    const report = preview?.report;
    const completed = preview?.completed;
    const mute = preview?.mute;
    const playback = preview?.playback;
    const handoff = preview?.handoff;
    const [resuming, setResuming] = useState(false);
    const available = (!!staticSource || !!preview?.serverAvailable) && enabled && !protect(item) && !!preview?.enabled;
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
        let stopInspection = () => undefined as void;
        let inspectedVideo: HTMLVideoElement | undefined;
        let startingVideo: HTMLVideoElement | undefined;
        let growing = !!clip;
        let measured: Parameters<typeof letterboxTransform>[4] | undefined;
        const framed = surface === 'hero' || surface === 'detail';
        const applyFraming = () => {
            if (!measured || !element.parentElement) return;
            const bounds = element.parentElement.getBoundingClientRect();
            element.style.transform = letterboxTransform(element.videoWidth, element.videoHeight, bounds.width, bounds.height, measured);
            element.classList.toggle('is-framed', !!element.style.transform);
        };
        const reveal = () => {
            if (disposed || finishing || !playback.owns(element, lease)) return;
            setVisible(true);
            if (!framed || clip) {
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
        window.addEventListener('resize', applyFraming);
        if (framed && !clip) element.volume = 0;
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
            if (disposed || !playback.owns(element, lease)) return;
            if (!framed) {
                reveal();
                return;
            }
            if (growing || inspectedVideo === element) return;
            const target = element;
            inspectedVideo = target;
            stopInspection();
            stopInspection = inspectPreviewLetterbox(target, bars => {
                if (disposed || target !== element || !playback.owns(target, lease)) return;
                measured = bars;
                if (bars) applyFraming();
                reveal();
            });
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
            stopInspection();
            window.removeEventListener('resize', applyFraming);
            element.style.transform = '';
            element.classList.remove('is-framed');
            cancelAnimationFrame(frame);
            cancelAnimationFrame(revealFrame);
            detach(element);
            // A clip on its way to the media page keeps playing.
            if (handedOver.current === element) handedOver.current = undefined;
            else playback?.release(element, lease);
        }
        const onError = () => {
            if (startingVideo !== element) finish();
        };
        const playTarget = async (target: HTMLVideoElement) => {
            const targetLease = lease;
            const current = () => !disposed && playback.owns(target, targetLease);
            startingVideo = target;
            const playing = await startPreviewVideo(target, current, () => mute?.());
            if (startingVideo === target) startingVideo = undefined;
            if (!current()) playback.release(target, targetLease);
            else if (!playing) finish();
        };
        const attach = (target: HTMLVideoElement) => {
            target.addEventListener('playing', ready);
            target.addEventListener('loadedmetadata', metadata);
            target.addEventListener('timeupdate', progress);
            target.addEventListener('ended', finish);
            target.addEventListener('error', onError);
        };
        const detach = (target: HTMLVideoElement) => {
            target.removeEventListener('playing', ready);
            target.removeEventListener('loadedmetadata', metadata);
            target.removeEventListener('timeupdate', progress);
            target.removeEventListener('ended', finish);
            target.removeEventListener('error', onError);
        };
        attach(element);
        if (clip) {
            // The same video carries on: it only needs to reach its place, then its best quality.
            if (element.paused) void playTarget(element);
            stopGrowing = growFrom(clip.from, place, element, () => {
                growing = false;
                ready();
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
                    if (measured) applyFraming();
                    if (next.paused) void playTarget(next);
                    else ready();
                });
            });
            return cleanupPlayback;
        }
        void playTarget(element);
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
