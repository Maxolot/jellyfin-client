import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import { DeviceSettings, LanguageSettings, LibrarySettings, ProfileSettings, SubtitleSettings } from '../account/AccountSettings';
import type { Preferences } from '../interfacePreferences';
import PlayerSettings from '../player/PlayerSettings';
import { SeerrSettings } from '../seerr/SeerrViews';
import AppearanceSettings from './AppearanceSettings';
import { resolveSection, SETTINGS_GROUPS, type SectionKey } from './sections';
import PreviewsServer from './server/PreviewsServer';
import SeerrServer from './server/SeerrServer';
import ServerOverview from './server/ServerOverview';
import SourcesServer from './server/SourcesServer';
import SettingsIcon from './SettingsIcon';
import './settings.scss';

type Props = { section: string | null; preferences: Preferences; savePreference: (next: Preferences) => void; hasPreviews: boolean };

function Content({ section, preferences, savePreference, hasPreviews }: Readonly<Omit<Props, 'section'> & { section: SectionKey }>) {
    switch (section) {
        case 'lecteur': return <PlayerSettings />;
        case 'langues': return <><LanguageSettings /><SubtitleSettings /></>;
        case 'qualite': return <DeviceSettings />;
        case 'bibliotheque': return <LibrarySettings />;
        case 'demandes': return <SeerrSettings />;
        case 'compte': return <ProfileSettings />;
        case 'serveur': return <ServerOverview />;
        case 'serveur-extraits': return <PreviewsServer />;
        case 'serveur-demandes': return <SeerrServer />;
        case 'serveur-sources': return <SourcesServer />;
        default: return <AppearanceSettings preferences={preferences} savePreference={savePreference} hasPreviews={hasPreviews} />;
    }
}

/** Settings: the person's own preferences first, then, for administrators, the server. */
export default function SettingsPage({ section: requested, ...props }: Readonly<Props>) {
    const { user } = useApi();
    const administrator = !!user?.Policy?.IsAdministrator;
    const section = resolveSection(requested, administrator);
    const nav = useRef<HTMLElement>(null);
    const server = section.key.startsWith('serveur');
    useEffect(() => {
        // On narrow screens the menu scrolls sideways: keep the open section in view.
        nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }, [section.key]);
    return <section className='client-preferences client-controls'>
        <h1>Paramètres</h1>
        <div className='client-preferences-layout'>
            <nav ref={nav} className='client-preferences-nav' aria-label='Sections des paramètres'>
                {SETTINGS_GROUPS.filter(group => administrator || !group.admin).map(group => <div key={group.title} className='client-preferences-group'>
                    <h2>{group.admin && <SettingsIcon name='lock' />}{group.title}</h2>
                    <ul>{group.sections.map(entry => <li key={entry.key}>
                        <Link to={`/client?view=settings&section=${entry.key}`} replace aria-current={entry.key === section.key ? 'page' : undefined}>
                            <SettingsIcon name={entry.icon} /><span>{entry.title}</span>
                        </Link>
                    </li>)}</ul>
                </div>)}
            </nav>
            <div className='client-preferences-content'>
                {!server && <header className='client-settings-intro'><h2>{section.title}</h2><p>{section.summary}</p></header>}
                <Content section={section.key} {...props} />
            </div>
        </div>
    </section>;
}
