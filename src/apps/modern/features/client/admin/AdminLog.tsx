/* eslint-disable react/jsx-no-bind -- Filters are local to this page. */
import type { ActivityLogEntry } from '@jellyfin/sdk/lib/generated-client';
import React, { useState } from 'react';

import { useApi } from 'hooks/useApi';

import { Segmented, SettingCard } from '../settings/controls';
import { plural, relativeTime, severityTone } from './model';
import { type LogFilters, useActivityLog } from './useAdmin';
import './admin.scss';

const PERIODS = [[1, '24 h'], [7, '7 jours'], [30, '30 jours']] as const;
const SEVERITIES = [['all', 'Tout'], ['problems', 'Problèmes']] as const;
const SOURCES = [['all', 'Tout'], ['users', 'Comptes'], ['system', 'Serveur']] as const;

function Entry({ entry }: Readonly<{ entry: ActivityLogEntry }>) {
    const [open, setOpen] = useState(false);
    const detail = entry.Overview && entry.Overview !== entry.ShortOverview ? entry.Overview : undefined;
    const date = entry.Date ? new Date(entry.Date) : undefined;
    return <li className='client-admin-log-line'>
        <i className={`client-admin-dot is-${severityTone(entry.Severity)}`} aria-hidden='true' />
        <span>
            <strong>{entry.Name}</strong>
            {entry.ShortOverview && <small>{entry.ShortOverview}</small>}
            {open && detail && <pre className='client-admin-detail'>{detail}</pre>}
        </span>
        <span className='client-admin-log-side'>
            <time dateTime={entry.Date} title={date?.toLocaleString('fr-FR')}>{relativeTime(entry.Date)}</time>
            {detail && <button type='button' className='client-admin-text-button' aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Moins' : 'Détail'}</button>}
        </span>
    </li>;
}

/** Administration, activity log: sign-ins, playback, errors and server events, filtered. */
export default function AdminLog() {
    const { user } = useApi();
    const [filters, setFilters] = useState<LogFilters>({ days: 7, severity: 'all', source: 'all' });
    const [pages, setPages] = useState(1);
    const log = useActivityLog(filters, pages);
    if (!user?.Policy?.IsAdministrator) return null;
    const change = (next: Partial<LogFilters>) => {
        setFilters({ ...filters, ...next });
        setPages(1);
    };
    const items = log.data?.Items || [];
    const more = (log.data?.TotalRecordCount || 0) > items.length;
    return <div className='client-admin'>
        <SettingCard>
            <Segmented label='Période' value={filters.days} options={PERIODS} onChange={days => change({ days })} />
            <Segmented label='Gravité' value={filters.severity} options={SEVERITIES} onChange={severity => change({ severity })} />
            <Segmented label='Origine' value={filters.source} options={SOURCES} onChange={source => change({ source })} />
        </SettingCard>
        <SettingCard title='Événements' description={log.data && `${plural(log.data.TotalRecordCount || 0, 'événement')} sur la période.`}>
            {log.isError && <p className='client-setting-note is-error' role='alert'>Le journal n’a pas pu être lu.</p>}
            {log.isPending && <p className='client-setting-note'>Chargement…</p>}
            {log.data && !items.length && <p className='client-admin-empty'>Rien sur cette période.</p>}
            <ul className='client-admin-list is-compact'>{items.map(entry => <Entry key={entry.Id} entry={entry} />)}</ul>
            {more && <div className='client-settings-actions'><button type='button' className='client-settings-button' disabled={log.isFetching} onClick={() => setPages(pages + 1)}>{log.isFetching ? 'Chargement…' : 'Afficher plus'}</button></div>}
        </SettingCard>
    </div>;
}
/* eslint-enable react/jsx-no-bind */
