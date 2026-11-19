import React from 'react';
import { Link } from 'react-router-dom';

import ClientIcon from '../ClientIcon';
import type { SeerrIdentity } from '../seerr/model';
import { latestRequest, requestEta, requestReason, requestRing, requestStageLabel, type RequestProgress } from './model';
import { useRequestProgress } from './queries';
import './requestProgress.scss';

export function ProgressRing({ progress }: Readonly<{ progress: number }>) {
    return <svg aria-hidden='true' className='client-request-ring' viewBox='0 0 36 36'>
        <circle cx='18' cy='18' r='15' pathLength='100' className='client-request-ring-track' />
        <circle cx='18' cy='18' r='15' pathLength='100' strokeDasharray={`${Math.max(4, Math.min(100, progress))} 100`} />
    </svg>;
}

export function RequestBell() {
    const query = useRequestProgress();
    const ring = requestRing(query.data || []);
    if (!ring) return null;
    const label = `Mes demandes, ${ring.count} en cours`;
    return <Link className='client-nav-tool client-request-bell' to='/client?view=requests' aria-label={label} title={label}>
        <ProgressRing progress={ring.percent} /><ClientIcon name='bell' />
    </Link>;
}

export function RequestProgressNote({ request }: Readonly<{ request: RequestProgress }>) {
    const eta = requestEta(request);
    const reason = requestReason(request);
    const waiting = (request.stage === 'blocked' || request.stage === 'downloading') && !eta;
    return <div className='client-request-progress-note'>
        {eta && <p><ClientIcon name='clock' />{eta}</p>}
        {reason && <p>{reason}</p>}
        {waiting && <p>Aucune estimation fiable pour le moment.</p>}
    </div>;
}

export function CompactRequest({ identity }: Readonly<{ identity?: SeerrIdentity }>) {
    const query = useRequestProgress(!!identity, !!identity);
    const request = identity ? latestRequest(query.data || [], identity) : undefined;
    if (!request) return null;
    return <aside className='client-compact-request' aria-label='Suivi de la demande'>
        <Link to='/client?view=requests'><ClientIcon name='bell' />{requestStageLabel(request.stage)}
            {request.stage === 'downloading' && request.percent != null && <span>{request.percent} %</span>}</Link>
        <RequestProgressNote request={request} />
    </aside>;
}
