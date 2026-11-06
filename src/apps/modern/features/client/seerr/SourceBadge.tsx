import React from 'react';

import type { SourceLanguage, SourceStatus } from './sources';

const LABELS: Record<SourceStatus, { short: string; long: string }> = {
    pending: { short: 'Recherche…', long: 'Recherche des sources en cours…' },
    found: { short: 'Source trouvée', long: 'Une source a été trouvée. Le téléchargement dépend des règles du serveur et de la disponibilité des sources.' },
    unknown: { short: 'Sources indisponibles', long: 'La recherche de sources a échoué (plugin ou indexeurs injoignables). Une demande reste possible.' },
    empty: { short: 'Aucune source', long: 'Aucune source trouvée pour le moment. Certains indexeurs peuvent être indisponibles ; une demande reste possible.' }
};

type Variant = 'line' | 'pill' | 'meta';
const TAGS: Record<SourceLanguage, { text: string; title: string }> = {
    multi: { text: 'MULTI', title: 'Plusieurs langues audio dont le français' },
    vf: { text: 'VF', title: 'Version française' },
    vostfr: { text: 'VOSTFR', title: 'Version originale sous-titrée en français' }
};
const CLASSES: Record<Variant, string> = { line: '', pill: ' client-request-status', meta: '' };

/**
 * Tells, before a request, whether the title is published on the torrent indexers.
 * `line` sits under a season, `pill` mirrors the status pills of the request dialog,
 * `meta` is a quiet line in the title information of a media page, which also admits a failed search.
 */
export default function SourceBadge({ status, variant = 'line', compact = false, languages = [], prefix }: Readonly<{ status?: SourceStatus; variant?: Variant; compact?: boolean; languages?: SourceLanguage[]; prefix?: string }>) {
    if (!status || (status === 'unknown' && variant !== 'meta')) return null;
    const label = LABELS[status];
    const text = prefix ? `${prefix} : ${label.short.toLowerCase()}` : label.short;
    return <span className={`client-source-badge is-${status} is-${variant}${compact ? ' is-compact' : ''}${CLASSES[variant]}`} title={label.long} role='status' aria-label={label.long}>
        <i className='client-source-dot' aria-hidden='true' />{text}
        {status === 'found' && languages.length > 0 && <span className='client-file-languages'>{languages.map(tag => <abbr key={tag} title={TAGS[tag].title}>{TAGS[tag].text}</abbr>)}</span>}
    </span>;
}
