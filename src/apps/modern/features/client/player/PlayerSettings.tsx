/* eslint-disable react/jsx-no-bind -- Settings use local, typed input handlers. */
import React, { type ReactNode } from 'react';
import { useApi } from 'hooks/useApi';
import { playerDefaults, playerPreferenceKey, usePlayerPreferences, type PlayerPreferences } from './preferences';
import { Segmented, Select, SettingCard, Slider, Toggle } from '../settings/controls';
import './player.scss';

type Fields = Readonly<{ value: PlayerPreferences; save: (next: PlayerPreferences) => void; layout?: 'cards' | 'panel' }>;

/** In the settings page each group is a card; in the player's panel, a titled block. */
function Group({ title, layout, children }: Readonly<{ title: string; layout: 'cards' | 'panel'; children: ReactNode }>) {
    if (layout === 'cards') return <SettingCard title={title} scope='browser'>{children}</SettingCard>;
    return <div className='client-player-group'><h3>{title}</h3>{children}</div>;
}

export function PlayerPreferenceFields({ value, save, layout = 'panel' }: Fields) {
    const set = <K extends keyof PlayerPreferences>(key: K) => (next: PlayerPreferences[K]) => save({ ...value, [key]: next });
    return <div className={`client-controls client-player-preferences is-${layout}`}>
        <Group title='Apparence' layout={layout}>
            <Segmented label='Style' value={value.style} onChange={set('style')} options={[['glass', 'Glass'], ['classic', 'Classique'], ['minimal', 'Minimal']]} />
            <Segmented label='Couleur d’accent' value={value.accent} onChange={set('accent')} options={[['white', 'Blanc'], ['red', 'Rouge'], ['blue', 'Bleu'], ['gold', 'Doré']]} />
            <Slider label='Taille des commandes' value={value.size} min={80} max={130} unit=' %' onChange={set('size')} />
            <Slider label='Masquer les commandes après' value={value.hideAfter} min={2} max={12} unit=' s' onChange={set('hideAfter')} />
            <Select label='Affichage du temps' value={value.time} onChange={set('time')} options={[['remaining', 'Temps restant'], ['total', 'Durée totale'], ['end', 'Heure de fin']]} />
        </Group>
        <Group title='Commandes' layout={layout}>
            <Segmented label='Reculer et avancer de' value={value.skip} onChange={set('skip')} options={[[5, '5 s'], [10, '10 s'], [15, '15 s'], [30, '30 s']]} />
            <Toggle label='Aperçus sur la barre de progression' hint='Selon les images préparées par le serveur.' checked={value.previews} onChange={set('previews')} />
            <Select label='Passer les intros' value={value.intro} onChange={set('intro')} options={[['button', 'Afficher le bouton'], ['auto', 'Automatiquement'], ['never', 'Jamais']]} />
            <Select label='Épisode suivant' value={value.next} onChange={set('next')} options={[[0, 'Pas d’enchaînement'], [5, 'Après 5 s'], [10, 'Après 10 s'], [15, 'Après 15 s'], [30, 'Après 30 s']]} />
        </Group>
        <Group title='Sous-titres' layout={layout}>
            <Slider label='Taille des sous-titres' value={value.subtitleSize} min={70} max={180} unit=' %' onChange={set('subtitleSize')} />
            <Slider label='Distance au bas de l’image' value={value.subtitlePosition} min={0} max={25} unit=' %' onChange={set('subtitlePosition')} />
            <Toggle label='Fond derrière les sous-titres' checked={value.subtitleBackground} onChange={set('subtitleBackground')} />
            <p className='client-setting-note'>S’applique aux pistes texte ; les pistes graphiques, ASS et incrustées gardent leur mise en forme.</p>
        </Group>
        <div className='client-settings-actions'><button type='button' className='client-settings-button' onClick={() => save({ ...playerDefaults })}>Rétablir les valeurs par défaut</button></div>
    </div>;
}
export default function PlayerSettings() {
    const { api, user } = useApi();
    const [value, save] = usePlayerPreferences(playerPreferenceKey(api?.basePath || '', user?.Id || ''));
    if (!api || !user?.Id) return null;
    return <section className='client-player-settings' id='player-settings'>
        <div className={`client-player-preview style-${value.style} accent-${value.accent}`} style={{ fontSize: `${value.size}%` }} aria-label='Aperçu du style du lecteur'><span className='client-player-preview-label'>Une soirée au cinéma</span><span className='client-player-preview-play' aria-hidden='true'>▶</span><div><span>12:40</span><i /><span>− 1:24:08</span></div></div>
        <PlayerPreferenceFields value={value} save={save} layout='cards' />
    </section>;
}

/* eslint-enable react/jsx-no-bind */
