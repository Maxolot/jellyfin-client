/* eslint-disable react/jsx-no-bind -- Row actions are local closures. */
import type { TaskInfo } from '@jellyfin/sdk/lib/generated-client';
import React from 'react';

import { useApi } from 'hooks/useApi';

import { SettingCard, StatusBadge } from '../settings/controls';
import { isRunning, relativeTime, taskGroups, taskResult } from './model';
import { useTaskAction, useTasks } from './useAdmin';
import './admin.scss';

function Task({ task }: Readonly<{ task: TaskInfo }>) {
    const action = useTaskAction();
    const running = isRunning(task);
    const result = taskResult(task);
    const progress = Math.round(task.CurrentProgressPercentage || 0);
    const last = task.LastExecutionResult;
    return <li className='client-admin-task'>
        <div className='client-admin-stream-body'>
            <div className='client-admin-stream-head'>
                <strong>{task.Name}</strong>
                {running ? <StatusBadge tone='busy'>{task.State === 'Cancelling' ? 'Arrêt…' : `${progress} %`}</StatusBadge> : <StatusBadge tone={result.tone}>{result.label}</StatusBadge>}
            </div>
            <small>{task.Description}</small>
            {running && <div className='client-admin-progress' role='progressbar' aria-label={task.Name || 'Tâche'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>}
            {!running && last?.EndTimeUtc && <small>Dernière exécution {relativeTime(last.EndTimeUtc)}{last.ErrorMessage ? ` · ${last.ErrorMessage}` : ''}</small>}
        </div>
        {task.Id && <button type='button' className='client-settings-button' disabled={action.isPending || task.State === 'Cancelling'}
            onClick={() => action.mutate({ taskId: task.Id!, start: !running })}>{running ? 'Arrêter' : 'Lancer'}</button>}
    </li>;
}

/** Administration, scheduled tasks: what the server does on its own, and a way to run or stop it now. */
export default function AdminTasks() {
    const { user } = useApi();
    const tasks = useTasks();
    if (!user?.Policy?.IsAdministrator) return null;
    return <div className='client-admin'>
        {tasks.isError && <p className='client-setting-note is-error' role='alert'>Les tâches n’ont pas pu être lues.</p>}
        {tasks.isPending && <p className='client-setting-note'>Chargement…</p>}
        {taskGroups(tasks.data).map(group => <SettingCard key={group.category} title={group.category}>
            <ul className='client-admin-list'>{group.tasks.map(task => <Task key={task.Id} task={task} />)}</ul>
        </SettingCard>)}
    </div>;
}
/* eslint-enable react/jsx-no-bind */
