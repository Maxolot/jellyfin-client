# Mode hors ligne

Les téléchargements restent sur l'appareil, dans le stockage du navigateur, sans service externe ni clé d'administration. Ils sont rattachés au serveur et au compte actif. La connexion Jellyfin existante fournit les droits ; le module ne conserve aucune copie supplémentaire du jeton.

## Utiliser le mode hors ligne

1. Ouvrir l'application en HTTPS (localhost convient pour le développement), se connecter et ouvrir la fiche d'un film ou d'une série.
2. Dans ⋯, choisir **Télécharger**. Pour une série, choisir la saison entière ou ses épisodes non vus. Le téléchargement d'un épisode seul se fait depuis sa fiche.
3. Choisir la qualité et, pour une conversion, la piste audio. Les sous-titres texte choisis restent disponibles séparément ; les sous-titres image sont incrustés dans une copie convertie.
4. Lors du premier téléchargement, l'application conserve aussi ses fichiers publics pour pouvoir redémarrer sans réseau. Cette préparation peut représenter plusieurs dizaines de Mo. Aucune réponse d'API ni config.json n'entre dans ce cache.
5. Menu du profil → **Hors ligne** : vérifier que le titre est **Prêt à lire**, puis couper le réseau. L'application peut être rechargée ; elle ouvre alors directement les téléchargements du compte actif. La lecture utilise le même lecteur personnalisé.

La page permet de mettre en pause, reprendre, annuler ou retirer un fichier local après confirmation et présente l'espace estimé par le navigateur. Le fichier présent sur le serveur n'est jamais supprimé. Les vidéos se téléchargent une par une, tant que l'application reste ouverte. Une file interrompue par rechargement est conservée et reprend quand le compte retrouve le réseau.

## Formats et espace

- Original : seulement un fichier MP4/M4V/MOV dont les codecs annoncés sont lisibles par le navigateur ; la piste audio par défaut du fichier est utilisée.
- Qualités converties : H.264/AAC stéréo, plafonds Haute 1080p/8 Mbit/s, Standard 720p/4 Mbit/s, Économie environ 480p/1,5 Mbit/s. Les choix dépassant la source sont évités. La taille est une estimation, la source peut garder un format d'image différent de 16:9.
- La conversion utilise les segments fMP4 du serveur ; la reprise conserve les segments complets. L'original reprend par plage d'octets si le serveur la prend en charge, sinon il repart du début.
- Les vidéos utilisent OPFS quand ce stockage fonctionne, sinon IndexedDB par morceaux. Une marge de quota et les vidéos déjà en attente sont prises en compte avant l'ajout. Le navigateur reste l'autorité sur l'espace réellement disponible.
- Le téléchargement et les conversions respectent la politique du compte. La conversion demande les droits audio et vidéo. Un refus 401/403 arrête le téléchargement.

## Reprise et confidentialité

La position est sauvegardée localement pendant la lecture et à son arrêt. Au retour du serveur, elle est envoyée en conservant les autres données utilisateur (favori, note…). Si le serveur indique une lecture plus récente sur un autre appareil, cette position est gardée.

Seul le compte actif, toujours présent dans les sessions locales du navigateur, ouvre ses fichiers. Se déconnecter ferme cet accès ; une reconnexion avec le même compte le rétablit. Cela ne chiffre pas les fichiers : une personne ayant accès au profil du navigateur ou à ses outils de développement peut examiner le stockage local. Retirer le profil navigateur efface aussi ses téléchargements. Les titres retirés de l'appareil avant synchronisation perdent leur progression locale non envoyée.

## Limites explicites

- HTTPS est indispensable hors localhost. Une adresse IP en HTTP telle que le serveur de revue local ne permet pas de garantir le redémarrage hors réseau.
- iPad/Safari : garder l'application au premier plan, hors navigation privée. La mise en veille ou la fermeture peut suspendre une préparation. La demande de stockage persistant peut être refusée et le navigateur peut supprimer des données sous pression d'espace. Les tests WebKit ne remplacent pas un essai sur iPad réel.
- Pas de téléchargement en arrière-plan garanti, ni application native, ni sauvegarde externe automatique. Garder les originaux sur Jellyfin.
- La file travaille dans l'onglet ouvert ; éviter de lancer simultanément le même téléchargement dans plusieurs onglets.
- La première connexion et la première préparation demandent le réseau. Une modification des droits sur le serveur ne peut pas être connue tant que l'appareil est déconnecté.

Les validations de cette livraison et leurs limites sont consignées dans STATUS.md.
