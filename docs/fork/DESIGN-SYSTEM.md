# Design system dans le code

La charte Médiathèque (design system publié sur claude.ai) dit à quoi ressemble le client. Ce
document dit comment le code la respecte. Le client web est la seule référence ; l’application
Android TV n’en est pas une tant qu’elle n’a pas été validée.

## Où vivent les choses

| Quoi | Où |
| --- | --- |
| Jetons (couleurs, texte, espaces, rayons, tailles, ombres, mouvement, seuils, verre) | `src/apps/modern/features/client/design/tokens.json` |
| Variables CSS générées | `design/_tokens.scss`, par `npm run design:tokens` ; posées une fois par `design/theme.scss` |
| Outils Sass | `design/_index.scss` : `@use '<chemin>/design' as ds;` |
| Composants partagés | `features/client/ui/` : `ActionButton`, `ActionLink`, `ActionAnchor`, `Chip`, `ChipGroup`, contrôles de réglages |
| Mots et notations | `features/client/labels.ts` : `episodeCode()`, `LABELS` |
| Plafonds des valeurs en dur | `scripts/fork/style-budget.json`, vérifiés par `npm run design:check` |

`tokens.json` contient ce que reprend la charte (`color`, `type`, `spacing`, `radius`, `size`,
`shadow`, `fontSize`) et ce qui est propre au code (`web` pour les valeurs fluides, `motion`,
`breakpoint`, `opacity`, `glass`). Un jeton ajouté ici l’est aussi dans la charte.

## Règles

1. **Une valeur vient d’un jeton.** Couleur `var(--client-ink)`, taille `var(--client-text-14)`,
   rayon `var(--client-radius-card)`, durée `var(--client-duration-state)`, courbe
   `var(--client-ease-move)`, largeur d’écran `@include ds.phone`. Une valeur absente se
   discute et entre d’abord dans `tokens.json`.
2. **Une page dispose, un composant s’habille.** Une feuille de page règle l’espace autour d’un
   bouton ou d’une pastille, jamais son apparence. Pour une autre taille, elle règle celle du
   groupe : `--client-action-height`, `--client-action-padding`, `--client-action-font`,
   `--client-action-weight`, ou la prop `size` (`large` 48, `medium` 40, `small` 32).
3. **Un état, un signal** (charte, États) : survol, focus `ds.focus-ring`, choisi
   (`aria-pressed`/`aria-checked` → `selected`, `on-selected`), ici (`aria-current` →
   `surface-highlight` bordé de `line`), désactivé (`--client-opacity-disabled`).
4. **Chaque écran suit le thème.** Surfaces `surface-panel`, `surface-raised`,
   `surface-control` ; aucun noir ni gris bleuté propre à une page.
5. **Les textes répétés viennent du lexique.** Saisons et épisodes par `episodeCode()`.

Le cliquet échoue en CI si une couleur, une taille de texte, une graisse hors échelle, un rayon
ou une durée est ajouté en dur hors de `design/`. Après une baisse :
`node scripts/fork/style-metrics.mjs --update`. Ne jamais relever un plafond à la main.

## Définition de terminé, pour un changement d’interface

- [ ] Classique et Liquid Glass.
- [ ] Téléphone (390 px), tablette (1 000 px) et grand écran (1 440 px), sans débordement.
- [ ] Clavier seul : focus visible, ordre logique, Échap ferme ce qui s’ouvre.
- [ ] `prefers-reduced-motion` : rien ne bouge.
- [ ] États vide, chargement, erreur et hors ligne écrits comme le dit la charte.
- [ ] Aucun titre de média sous une carte.
- [ ] `npm run design:check`, stylelint, tests et types passent.
- [ ] Contrôle navigateur sur la fixture (ci-dessous) sans nouvelle erreur ni violation axe.

## Contrôle navigateur local

`.fork-local/check-ui.cjs` (non versionné) sert un build devant la fixture Jellyfin et parcourt
douze pages : erreurs JavaScript, requêtes en échec, images cassées, débordement horizontal,
titres sous une carte, fonds bleutés en Glass, violations axe graves, et styles calculés des
éléments de la charte. `compare` liste les écarts entre deux relevés, sans capture d’écran ;
`.fork-local/pixel-diff.py` chiffre la différence entre deux captures quand il en faut une.

```sh
node .fork-local/check-ui.cjs snapshot <build> avant.json [--classic] [--width=390]
node .fork-local/check-ui.cjs compare avant.json apres.json
```

## Reste à faire

- Valeurs encore en dur (`npm run design:metrics`) : 594 couleurs, surtout ombres, dégradés et
  teintes du verre, le lecteur, la session et les profils ; 31 tailles de texte, 12 rayons et
  20 durées hors échelle, gardés volontairement (animations longues, très petits écrans).
- 180 déclarations du CSS compilé sont écrasées plus loin par le même sélecteur : restes de
  couches successives, à fusionner page par page.
- `index.html` interdit le zoom (`user-scalable=no`), seule violation axe restante. Le lever
  demande de vérifier les gestes du lecteur sur téléphone (double tape).
- `prototype.scss` (1 800 lignes) et `routes/client.tsx` (1 000 lignes) restent à découper au fil
  des migrations.
