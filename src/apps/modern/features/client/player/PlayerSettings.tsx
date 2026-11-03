/* eslint-disable react/jsx-no-bind -- Settings use local, typed input handlers. */
import React from 'react';
import { useApi } from 'hooks/useApi';
import { playerDefaults, playerPreferenceKey, usePlayerPreferences, type PlayerPreferences } from './preferences';
import './player.scss';

export function PlayerPreferenceFields({ value, save }: Readonly<{ value: PlayerPreferences; save: (next: PlayerPreferences) => void }>) {
    const select = <K extends keyof PlayerPreferences>(key: K, label: string, options: readonly (readonly [PlayerPreferences[K], string])[]) => <label>{label}<select aria-label={label} value={String(value[key])} onChange={event => {
        const option = options.find(([id]) => String(id) === event.target.value);
        if (option) save({ ...value, [key]: option[0] });
    }}>{options.map(([id, name]) => <option key={String(id)} value={String(id)}>{name}</option>)}</select></label>;
    const range = (key: 'size' | 'hideAfter' | 'subtitleSize' | 'subtitlePosition', label: string, min: number, max: number, unit: string) => <label>{label}<output>{value[key]}{unit}</output><input type='range' aria-label={label} min={min} max={max} value={value[key]} onChange={event => save({ ...value, [key]: Number(event.target.value) })} /></label>;
    return <div className='client-player-fields'>
        {select('style', 'Style', [['glass', 'Glass'], ['classic', 'Classique'], ['minimal', 'Minimal']])}
        {select('accent', 'Couleur d’accent', [['white', 'Blanc'], ['red', 'Rouge'], ['blue', 'Bleu'], ['gold', 'Doré']])}
        {range('size', 'Taille des commandes', 80, 130, ' %')}
        {range('hideAfter', 'Masquer les commandes après', 2, 12, ' s')}
        {select('skip', 'Reculer et avancer de', [[5, '5 secondes'], [10, '10 secondes'], [15, '15 secondes'], [30, '30 secondes']])}
        {select('time', 'Affichage du temps', [['remaining', 'Temps restant'], ['total', 'Durée totale'], ['end', 'Heure de fin']])}
        <label className='client-player-check'><input type='checkbox' checked={value.previews} onChange={event => save({ ...value, previews: event.target.checked })} /> Aperçus sur la barre de progression</label>
        {select('intro', 'Passer les intros', [['button', 'Afficher le bouton'], ['auto', 'Automatiquement'], ['never', 'Jamais']])}
        {select('next', 'Épisode suivant', [[0, 'Passage automatique désactivé'], [5, 'Compte à rebours de 5 s'], [10, 'Compte à rebours de 10 s'], [15, 'Compte à rebours de 15 s'], [30, 'Compte à rebours de 30 s']])}
        {range('subtitleSize', 'Taille des sous-titres', 70, 180, ' %')}
        {range('subtitlePosition', 'Distance des sous-titres au bas de l’image', 0, 25, ' %')}
        <label className='client-player-check'><input type='checkbox' checked={value.subtitleBackground} onChange={event => save({ ...value, subtitleBackground: event.target.checked })} /> Fond derrière les sous-titres</label>
        <p className='client-player-hint'>Les aperçus et segments dépendent des données du serveur. L’apparence des sous-titres s’applique aux pistes texte ; les pistes graphiques, ASS et incrustées gardent leur mise en forme.</p>
        <button type='button' onClick={() => save({ ...playerDefaults })}>Rétablir les valeurs par défaut</button>
    </div>;
}
export default function PlayerSettings() {
    const { api, user } = useApi();
    const [value, save] = usePlayerPreferences(playerPreferenceKey(api?.basePath || '', user?.Id || ''));
    if (!api || !user?.Id) return null;
    return <section className='client-player-settings' id='player-settings'><h2>Lecteur</h2><p>Vos préférences sont conservées pour ce compte sur ce navigateur.</p>
        <div className={`client-player-preview style-${value.style} accent-${value.accent}`} style={{ fontSize: `${value.size}%` }} aria-label='Aperçu du style du lecteur'><span className='client-player-preview-label'>Une soirée au cinéma</span><span className='client-player-preview-play' aria-hidden='true'>▶</span><div><span>12:40</span><i /><span>− 1:24:08</span></div></div>
        <PlayerPreferenceFields value={value} save={save} />
    </section>;
}

/* eslint-enable react/jsx-no-bind */
