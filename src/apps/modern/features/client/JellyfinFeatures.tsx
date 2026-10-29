import React from 'react';
import { Link } from 'react-router-dom';

import RemotePlayButton from '../../components/AppToolbar/RemotePlayButton';
import SyncPlayButton from '../../components/AppToolbar/SyncPlayButton';
import { useApi } from 'hooks/useApi';
import { useQuickConnectEnabled } from 'hooks/useQuickConnect';
import { pluginManager } from 'components/pluginManager';
import { PluginType } from 'constants/pluginType';
import './jellyfinFeatures.scss';

export default function JellyfinFeatures() {
    const { user } = useApi();
    const { data: quickConnect } = useQuickConnectEnabled();
    if (!user?.Id) return null;
    const account = `?userId=${encodeURIComponent(user.Id)}`;
    const syncPlay = user.Policy?.SyncPlayAccess !== 'None' && pluginManager.ofType(PluginType.SyncPlay).length > 0;
    return <section className='client-settings client-jellyfin-features'>
        <Link className='client-original-link' to='/client'>← Retour à l’accueil</Link>
        <h1>Fonctions Jellyfin</h1>
        <section><h2>Lecture et sous-titres</h2><div className='client-native-links'>
            <Link to={`/mypreferencesplayback${account}`}><strong>Préférences de lecture</strong><small>Langue audio, qualité, lecture automatique et comportement du lecteur.</small></Link>
            <Link to={`/mypreferencessubtitles${account}`}><strong>Préférences de sous-titres</strong><small>Langue, sélection automatique et apparence des sous-titres.</small></Link>
        </div><p>Les pistes audio, chapitres, qualité et vitesse se choisissent aussi pendant la lecture, dans le lecteur.</p></section>
        <section><h2>Appareils et lecture partagée</h2><div className='client-native-links'>
            {quickConnect && <Link to={`/quickconnect${account}`}><strong>Connecter un appareil</strong><small>Autoriser un appareil avec son code Quick Connect.</small></Link>}
        </div><div className='client-native-control'><RemotePlayButton /><div><strong>Lire sur un autre appareil</strong><p>Choisir un lecteur connecté ou une destination compatible.</p></div></div>
        {syncPlay && <div className='client-native-control'><SyncPlayButton /><div><strong>Regarder ensemble</strong><p>Créer ou rejoindre un groupe SyncPlay.</p></div></div>}</section>
        <section><h2>Bibliothèque</h2><div className='client-native-links'>
            <Link to='/boxsets'><strong>Gérer les collections</strong><small>Retrouver les collections et leurs options Jellyfin.</small></Link>
        </div><p>Sur chaque fiche, « Options et fiche Jellyfin » donne accès aux versions, bonus, informations techniques et actions disponibles pour ce média et votre compte.</p></section>
        <section><h2>Compte</h2><div className='client-native-links'>
            <Link to={`/userprofile${account}`}><strong>Mon compte</strong><small>Profil et sécurité du compte.</small></Link>
            <Link to={`/mypreferencesmenu${account}`}><strong>Tous les réglages Jellyfin</strong><small>Retrouver les préférences natives du compte.</small></Link>
        </div></section>
    </section>;
}
