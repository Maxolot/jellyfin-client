# Profils

La page « Qui regarde ? » (`/client?view=profiles`) liste uniquement les comptes déjà connectés sur ce navigateur : le client n'interroge jamais la liste des utilisateurs du serveur.

- Chaque compte garde sa session dans `localStorage` et bascule sans mot de passe. Celle d'un administrateur n'est jamais gardée et se ferme quand on quitte le profil.
- Avant d'entrer, le client vérifie auprès du serveur que la session appartient bien au profil choisi.
- « Se déconnecter » et « Retirer » ferment la session sur le serveur et retirent le profil de ce navigateur.
- Un profil s'ajoute par mot de passe ou par Quick Connect.

## Galerie de photos (optionnelle)

Sans `clientAvatars` dans `config.json`, la galerie n'existe pas. Pour l'activer, servez vos propres images et indiquez l'adresse de leur liste :

```json
{ "clientAvatars": "./client-avatars/avatars.json" }
```

```json
[{ "id": "unique", "name": "Nom affiché", "collection": "Regroupement", "file": "image.webp" }]
```

`file` est un simple nom de fichier situé à côté de la liste (`webp`, `png` ou `jpeg`). La photo choisie est enregistrée sur le compte Jellyfin, avec la session du profil.

**Aucune image n'est fournie avec le projet.** N'ajoutez au dépôt que des images que vous avez le droit de redistribuer.
