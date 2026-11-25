// Lexique du client (charte Médiathèque, Écriture) : les mots et notations répétés d'un écran à l'autre.

/** Saison et épisode : « S1 · É2 ». « É » et non « E » : l'interface est en français. */
export function episodeCode(season: number, episode: number): string {
    return `S${season} · É${episode}`;
}

/** Verbes d'action et réponses courantes, identiques partout. */
export const LABELS = {
    play: 'Lecture',
    resume: 'Reprendre',
    moreInfo: 'Plus d’infos',
    myList: 'Ma liste',
    markWatched: 'Marquer vu',
    markUnwatched: 'Marquer non vu',
    openDetail: 'Voir la fiche',
    retry: 'Réessayer',
    cancel: 'Annuler',
    close: 'Fermer',
    showMore: 'Afficher plus'
} as const;
