import React from 'react';

import type { SourceLanguage, SourceStatus } from './sources';

const LABELS: Record<Exclude<SourceStatus, 'unknown'>, { short: string; long: string }> = {
    pending: { short: 'Recherche…', long: 'Recherche des sources en cours…' },
    found: { short: 'Source trouvée', long: 'Une source a été trouvée. Le téléchargement dépend des règles du serveur et de la disponibilité des sources.' },
    empty: { short: 'Aucune source', long: 'Aucune source trouvée pour le moment. Certains indexeurs peuvent être indisponibles ; une demande reste possible.' }
};

/** Quiet line (dot + text) telling, before a request, whether the title is already published on the torrent indexers. */
type Variant = 'line' | 'pill' | 'button';
/** `line` sits under a season, `pill` mirrors the status pills of the request dialog, `button` matches the action buttons next to it. */
const TAGS: Record<SourceLanguage, { text: string; title: string }> = {
    multi: { text: 'MULTI', title: 'Plusieurs langues audio dont le français' },
    vf: { text: 'VF', title: 'Version française' },
    vostfr: { text: 'VOSTFR', title: 'Version originale sous-titrée en français' }
};
const CLASSES: Record<Variant, string> = { line: '', pill: ' client-request-status', button: ' client-button client-availability-action' };

export default function SourceBadge({ status, variant = 'line', compact = false, languages = [] }: Readonly<{ status?: SourceStatus; variant?: Variant; compact?: boolean; languages?: SourceLanguage[] }>) {
    if (!status || status === 'unknown') return null;
    const label = LABELS[status];
    return <span className={`client-source-badge is-${status} is-${variant}${compact ? ' is-compact' : ''}${CLASSES[variant]}`} title={label.long} role='status' aria-label={label.long}>
        <i className='client-source-dot' aria-hidden='true' />{label.short}{status === 'found' && languages.map(tag => <b key={tag} className={`client-source-lang is-${tag}`} title={TAGS[tag].title}>{TAGS[tag].text}</b>)}
    </span>;
}
