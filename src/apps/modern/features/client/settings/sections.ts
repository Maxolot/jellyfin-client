import type { SettingsIconName } from './SettingsIcon';

export type SectionKey = 'apparence' | 'lecteur' | 'langues' | 'qualite' | 'bibliotheque' | 'demandes' | 'compte' | 'confidentialite'
    | 'admin' | 'admin-comptes' | 'admin-bibliotheques' | 'admin-taches' | 'admin-journal'
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
        { key: 'confidentialite', title: 'Confidentialité', summary: 'Suggestions personnalisées à deux', icon: 'lock' },
        { key: 'compte', title: 'Compte', summary: 'Photo, mot de passe, autres appareils', icon: 'account' }
    ] },
    { title: 'Administration', admin: true, sections: [
        { key: 'admin', title: 'Vue d’ensemble', summary: 'Lectures en cours, état du serveur, stockage et activité', icon: 'activity' },
        { key: 'admin-comptes', title: 'Comptes', summary: 'Comptes, droits et accès aux bibliothèques', icon: 'users' },
        { key: 'admin-bibliotheques', title: 'Bibliothèques', summary: 'Analyses et aperçus de navigation', icon: 'library' },
        { key: 'admin-taches', title: 'Tâches', summary: 'Tâches planifiées du serveur', icon: 'tasks' },
        { key: 'admin-journal', title: 'Journal', summary: 'Activité et erreurs du serveur', icon: 'log' }
    ] },
    { title: 'Extensions', admin: true, sections: [
        { key: 'serveur', title: 'Plugins', summary: 'Extensions de cette application et plugins installés', icon: 'plugin' },
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
