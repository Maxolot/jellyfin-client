import React from 'react';

import ClientIcon from '../ClientIcon';
import type { SourceStatus } from './sources';

const LABELS: Record<Exclude<SourceStatus, 'unknown'>, { short: string; long: string }> = {
    pending: { short: 'Recherche…', long: 'Recherche des sources en cours…' },
    found: { short: 'Source trouvée', long: 'Une source a été trouvée. Le téléchargement dépend des règles du serveur et de la disponibilité des sources.' },
    empty: { short: 'Aucune source', long: 'Aucune source trouvée pour le moment. Certains indexeurs peuvent être indisponibles ; une demande reste possible.' }
};

/** Small pill telling, before a request, whether the title is already published on the torrent indexers. */
export default function SourceBadge({ status, compact = false }: Readonly<{ status?: SourceStatus; compact?: boolean }>) {
    if (!status || status === 'unknown') return null;
    const label = LABELS[status];
    return <span className={`client-source-badge is-${status}${compact ? ' is-compact' : ''}`} title={label.long} role='status' aria-label={label.long}>
        <ClientIcon name={status === 'found' ? 'check' : 'search'} />{label.short}
    </span>;
}
