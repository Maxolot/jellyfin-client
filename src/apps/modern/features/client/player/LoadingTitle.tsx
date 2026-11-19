import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useCallback, useEffect, useState } from 'react';

import { artworkUrl } from '../artwork';
import { episodeLabel } from '../model';

type Props = Readonly<{ item?: BaseItemDto; basePath: string; label: string }>;

/**
 * Shown in the middle of the screen while the video prepares or buffers, instead of a spinner:
 * only the title logo (the series logo for an episode), otherwise the title itself. Its slow
 * breathing is the only sign of loading: no bar, no episode line on screen.
 */
export default function LoadingTitle({ item, basePath, label }: Props) {
    const series = item?.Type === 'Episode';
    const title = (series ? item?.SeriesName : item?.Name) || '';
    const logo = item && (item.ImageTags?.Logo || series) ? artworkUrl(basePath, item, 'logo') : '';
    const [failed, setFailed] = useState('');
    useEffect(() => setFailed(''), [logo]);
    const showLogo = !!logo && failed !== logo;
    const onError = useCallback(() => setFailed(logo), [logo]);
    // Screen readers still hear which episode starts; the screen only shows the title.
    const spoken = [label, title, series && item ? `${episodeLabel(item)} · ${item.Name || ''}` : ''].filter(Boolean).join(' ');
    return <div className='client-player-loading-title' role='status' aria-label={spoken}>
        {showLogo && <img src={logo} alt='' onError={onError} />}
        {!showLogo && <strong>{title || label}</strong>}
    </div>;
}
