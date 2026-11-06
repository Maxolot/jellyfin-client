import React, { useEffect, useState } from 'react';
import type { ChapterInfo, TrickplayInfoDto } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from 'hooks/useApi';
import { formatTime, SECOND, trickplayTile } from './model';

export function TimelinePreview({ seconds, duration, chapters, trickplay, itemId, mediaSourceId, enabled }: Readonly<{
    seconds: number; duration: number; chapters: ChapterInfo[]; trickplay?: TrickplayInfoDto; itemId: string; mediaSourceId?: string | null; enabled: boolean;
}>) {
    const { __legacyApiClient__: client } = useApi();
    const [loaded, setLoaded] = useState('');
    const [failedSprite, setFailedSprite] = useState('');
    const chapter = [...chapters].reverse().find(value => (value.StartPositionTicks || 0) / SECOND <= seconds);
    const chapterIndex = chapter ? chapters.indexOf(chapter) : -1;
    const tile = enabled && trickplay ? trickplayTile(trickplay, seconds) : undefined;
    const spriteUrl = tile && enabled && client && itemId ? client.getUrl(`Videos/${itemId}/Trickplay/${tile.width}/${tile.index}.jpg`, { ApiKey: client.accessToken(), MediaSourceId: mediaSourceId }) : '';
    const chapterUrl = enabled && client && itemId && chapter?.ImageTag ? client.getUrl(`Items/${itemId}/Images/Chapter/${chapterIndex}`, { tag: chapter.ImageTag, maxWidth: 240 }) : '';
    const useTile = !!tile && spriteUrl !== failedSprite;
    const url = useTile ? spriteUrl : chapterUrl;
    useEffect(() => {
        if (!url) return;
        let active = true;
        const image = new Image();
        image.onload = () => {
            if (active) setLoaded(url);
        };
        image.onerror = () => {
            if (active) {
                setLoaded('');
                if (useTile) setFailedSprite(url);
            }
        };
        image.src = url;
        return () => {
            active = false;
        };
    }, [url, useTile]);
    const scale = tile ? Math.min(1, 220 / tile.width, window.innerWidth * 0.4 / tile.width) : 1;
    const ready = url && loaded === url;
    return <div className='client-player-scrub-preview' style={{ left: `clamp(calc(min(220px, 40vw) / 2 + 12px), ${duration ? seconds / duration * 100 : 0}%, calc(100% - min(220px, 40vw) / 2 - 12px))` }}>
        {ready && useTile && tile && <div className='client-player-sprite' style={{ width: tile.width * scale, height: tile.height * scale, backgroundImage: `url("${url}")`, backgroundPosition: `${tile.x * scale}px ${tile.y * scale}px`, backgroundSize: `${tile.width * (trickplay?.TileWidth || 1) * scale}px ${tile.height * (trickplay?.TileHeight || 1) * scale}px` }} />}
        {ready && !useTile && <img className='client-player-chapter-image' src={url} alt='Chapitre' />}
        <span>{formatTime(seconds)}</span>{chapter?.Name && <small>{chapter.Name}</small>}
        {enabled && !ready && <small>Image non disponible</small>}{ready && !useTile && <small>Image du chapitre</small>}
    </div>;
}
