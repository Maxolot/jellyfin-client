import type { SettingsIconName } from './SettingsIcon';

export type SectionKey = 'apparence' | 'lecteur' | 'langues' | 'qualite' | 'bibliotheque' | 'demandes' | 'compte'
    | 'serveur' | 'serveur-extraits' | 'serveur-demandes' | 'serveur-sources';

export type SettingsSection = { key: SectionKey; title: string; summary: string; icon: SettingsIconName };
export type SettingsGroup = { title: string; admin: boolean; sections: SettingsSection[] };

export const SETTINGS_GROUPS: SettingsGroup[] = [
    { title: 'Vos préférences', admin: false, sections: [
        { key: 'apparence', title: 'Apparence', summary: 'Thème, accueil, fiches et extraits vidéo', icon: 'appearance' },
        { key: 'lecteur', title: 'Lecteur', summary: 'Commandes, épisode suivant, style des sous-titres', icon: 'player' },
        { key: 'langues', title: 'Langues', summary: 'Audio et sous-titres préférés', icon: 'languages' },
        { key: 'qualite', title: 'Qualité', summary: 'Débit, résolution et compatibilité de cet appareil', icon: 'quality' },
        { key: 'bibliotheque', title: 'Bibliothèque', summary: 'Épisodes manquants, Continuer à regarder', icon: 'library' },
        { key: 'demandes', title: 'Demandes', summary: 'Découvertes et demandes avec Seerr', icon: 'requests' },
        { key: 'compte', title: 'Compte', summary: 'Photo, mot de passe, autres appareils', icon: 'account' }
    ] },
    { title: 'Serveur', admin: true, sections: [
        { key: 'serveur', title: 'Vue d’ensemble', summary: 'Extensions et administration de Jellyfin', icon: 'server' },
        { key: 'serveur-extraits', title: 'Extraits vidéo', summary: 'Plugin Native Previews', icon: 'previews' },
        { key: 'serveur-demandes', title: 'Demandes', summary: 'Plugin Moonbase et Seerr', icon: 'requests' },
        { key: 'serveur-sources', title: 'Sources', summary: 'Plugin Movie Sources et Prowlarr', icon: 'sources' }
    ] }
];

// Addresses used before the redesign keep working.
const FORMER: Record<string, SectionKey> = { interface: 'apparence', lecture: 'lecteur' };

/** The section to show for an address; server pages fall back to the preferences for everyone else. */
export function resolveSection(requested: string | null, administrator: boolean): SettingsSection {
    const key = (requested && FORMER[requested]) || requested;
    const groups = SETTINGS_GROUPS.filter(group => administrator || !group.admin);
    return groups.flatMap(group => group.sections).find(section => section.key === key) || SETTINGS_GROUPS[0].sections[0];
}
