import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useCallback, useEffect, useState } from 'react';

import { artworkUrl } from '../artwork';
import { episodeLabel } from '../model';

type Props = Readonly<{ item?: BaseItemDto; basePath: string; label: string }>;

/**
 * Shown in the middle of the screen while the video prepares or buffers, instead of a spinner:
 * the title logo when the library has one, otherwise the title itself, gently pulsing.
 */
export default function LoadingTitle({ item, basePath, label }: Props) {
    const series = item?.Type === 'Episode';
    const title = (series ? item?.SeriesName : item?.Name) || '';
    const logo = item && (item.ImageTags?.Logo || series) ? artworkUrl(basePath, item, 'logo') : '';
    const [failed, setFailed] = useState('');
    useEffect(() => setFailed(''), [logo]);
    const showLogo = !!logo && failed !== logo;
    const onError = useCallback(() => setFailed(logo), [logo]);
    return <div className='client-player-loading-title' role='status' aria-label={title ? `${label} ${title}` : label}>
        {showLogo && <img src={logo} alt='' onError={onError} />}
        {!showLogo && <strong>{title || label}</strong>}
        {series && item && <small className='client-player-loading-episode'>{`${episodeLabel(item)} · ${item.Name || ''}`}</small>}
        <span className='client-player-loading-bar' aria-hidden='true'><i /></span>
    </div>;
}
