/* eslint-disable react/jsx-no-bind -- Settings use small typed handlers. */
import React from 'react';

import InterfacePreview from '../InterfacePreview';
import type { Preferences } from '../interfacePreferences';
import { PictureChoice, Segmented, SettingCard, Slider, Toggle } from './controls';

type Props = { preferences: Preferences; savePreference: (next: Preferences) => void; hasPreviews: boolean };

/** Interface preferences: stored for this account on this browser, under the same keys as before. */
export default function AppearanceSettings({ preferences, savePreference, hasPreviews }: Readonly<Props>) {
    const set = <K extends keyof Preferences>(key: K) => (value: Preferences[K]) => savePreference({ ...preferences, [key]: value });
    return <>
        <SettingCard title='Thème' scope='browser'>
            <PictureChoice label='Style de l’interface' value={preferences.glass} onChange={set('glass')}
                options={[{ value: true, label: 'Liquid Glass', preview: <InterfacePreview kind='glass' /> }, { value: false, label: 'Classique', preview: <InterfacePreview kind='classic' /> }]} />
            <Toggle label='Couleurs inspirées du média' hint='Les fonds prennent la teinte de l’affiche mise en avant.' checked={preferences.chromatic} onChange={set('chromatic')} />
            <Toggle label='Fond immersif au survol' hint='L’image du titre survolé s’étend derrière la page.' checked={preferences.ambient} onChange={set('ambient')} />
        </SettingCard>
        <SettingCard title='Accueil et navigation' scope='browser'>
            <PictureChoice label='Visuel principal' value={preferences.hero} onChange={set('hero')}
                options={[{ value: 'framed', label: 'Encadré', preview: <InterfacePreview kind='hero-framed' /> }, { value: 'background', label: 'Fond plein écran', preview: <InterfacePreview kind='hero-background' /> }]} />
            <PictureChoice label='Barre de navigation' value={preferences.floating} onChange={set('floating')}
                options={[{ value: false, label: 'Bandeau du thème', preview: <InterfacePreview kind='grouped' /> }, { value: true, label: 'Boutons flottants', preview: <InterfacePreview kind='floating' /> }]} />
            <Segmented label='Alignement des boutons' value={preferences.headerAlignment} onChange={set('headerAlignment')}
                options={[['left', 'À gauche'], ['center', 'Au centre'], ['right', 'À droite']]} />
            <Slider label='Hauteur du fondu du visuel principal' value={preferences.heroFade} min={20} max={70} unit=' %' onChange={set('heroFade')} />
            <Toggle label='Descriptions au survol entre les sections' hint='Titre et résumé apparaissent sous la rangée survolée.' checked={preferences.hoverDescriptions} onChange={set('hoverDescriptions')} />
        </SettingCard>
        <SettingCard title='Fiches des films et séries' scope='browser'>
            <PictureChoice label='Fond des fiches' value={preferences.detail} onChange={set('detail')}
                options={[{ value: 'continuous', label: 'Fond continu', preview: <InterfacePreview kind='continuous' /> }, { value: 'fade', label: 'Fondu progressif', preview: <InterfacePreview kind='fade' /> },
                    { value: 'immersive', label: 'Fiche immersive', preview: <InterfacePreview kind='immersive' /> }]} />
            <Segmented label='Lisibilité du texte' value={preferences.detailTreatment} onChange={set('detailTreatment')}
                options={[['progressive', 'Flou progressif'], ['cinema', 'Voile cinéma'], ['clear', 'Image nette']]} />
            <Slider label='Intensité du flou' hint={preferences.detailTreatment === 'progressive' ? undefined : 'Avec le flou progressif seulement.'} value={preferences.detailBlur} min={0} max={48} unit=' px'
                disabled={preferences.detailTreatment !== 'progressive'} onChange={set('detailBlur')} />
            <Slider label='Assombrissement derrière le texte' value={preferences.detailShade} min={0} max={95} unit=' %' onChange={set('detailShade')} />
            <Slider label='Largeur de la zone de lecture' value={preferences.detailWidth} min={35} max={85} unit=' %' onChange={set('detailWidth')} />
        </SettingCard>
        <SettingCard title='Extraits vidéo' scope='browser' description='Chaque extrait se joue une fois au survol, puis revient doucement à l’affiche. Le son est commun à tous les extraits.'>
            <Toggle label='Lire les extraits vidéo' hint={hasPreviews ? undefined : 'Aucun extrait n’est encore disponible sur ce serveur.'} checked={preferences.previews} onChange={set('previews')} />
            <Toggle label='Son des extraits' checked={!preferences.previewMuted} disabled={!preferences.previews} onChange={value => savePreference({ ...preferences, previewMuted: !value })} />
        </SettingCard>
    </>;
}
/* eslint-enable react/jsx-no-bind */
