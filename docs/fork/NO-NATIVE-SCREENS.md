# Aucun écran d'origine

Ce client n'affiche plus aucune page, aucun logo ni aucun nom de Jellyfin Web. Le moteur (SDK, connexion, lecture) reste celui d'origine ; seule la présentation change.

| Ancien écran | Maintenant |
| --- | --- |
| Connexion, choix et ajout de serveur, mot de passe oublié | `features/client/session` et page de profils |
| Chargement, logo de démarrage, économiseur au logo | Anneau neutre ; logos remplacés à la compilation par une image vide |
| Page introuvable, erreurs, serveur injoignable | `SessionNotice` |
| Fiche d'un titre (`/details`) | « ⋯ → Informations » : versions, détail technique, chapitres, bonus, liens |
| Accueil, bibliothèques, recherche, préférences | Redirigés vers le client (`routes/redirects.tsx`) |
| Musique, livres, TV en direct, listes de lecture | Redirigés vers l'accueil : hors du périmètre de ce client |
| Administration, première installation | Ouvertes dans l'interface propre au serveur (`/web/`) |
| Messages du moteur (alertes, choix) | Logique d'origine, habillage `session/nativeDialogs.scss` |

Le code d'origine reste dans le dépôt, sans route pour l'atteindre, afin de garder les mises à jour simples.

## Nom et logo

Le projet n'a pas encore d'identité. Pour la lui donner :

- le nom : `constants/branding.ts` (`APP_NAME`), `manifest.json` et `index.html` ;
- l'icône : `assets/brand/favicons`.
