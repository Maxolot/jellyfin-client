/* eslint-disable react/jsx-no-bind -- Choices are local to this short-lived panel. */
import React from 'react';

import ClientIcon from './ClientIcon';
import { NO_SUBTITLES, type TrackChoice, type TrackOption } from './trackChoice';

type Row = { key?: string; label: string };

function Choices({ title, rows, value, choose }: Readonly<{ title: string; rows: Row[]; value?: string; choose: (key?: string) => void }>) {
    return <>
        <span className='client-more-heading' role='presentation'>{title}</span>
        {rows.map(row => <button key={row.key || 'default'} type='button' role='menuitemradio' aria-checked={value === row.key} aria-label={`${title} : ${row.label}`} onClick={() => choose(row.key)}>
            <span className='client-more-mark'>{value === row.key && <ClientIcon name='check' />}</span>{row.label}
        </button>)}
    </>;
}

/** Second page of the "more" menu: the languages the next playback starts with. */
export default function TrackMenu({ audio, subtitles, choice, onChange, onBack }: Readonly<{ audio: TrackOption[]; subtitles: TrackOption[]; choice: TrackChoice; onChange: (choice: TrackChoice) => void; onBack: () => void }>) {
    return <>
        <button type='button' role='menuitem' onClick={onBack}><ClientIcon name='back' />Audio et sous-titres</button>
        {audio.length > 1 && <Choices title='Audio' rows={[{ label: 'Par défaut' }, ...audio]} value={choice.audio} choose={key => onChange({ ...choice, audio: key })} />}
        {subtitles.length > 0 && <Choices title='Sous-titres' rows={[{ label: 'Par défaut' }, ...subtitles, { key: NO_SUBTITLES, label: 'Aucun' }]} value={choice.subtitle} choose={key => onChange({ ...choice, subtitle: key })} />}
    </>;
}
/* eslint-enable react/jsx-no-bind */
