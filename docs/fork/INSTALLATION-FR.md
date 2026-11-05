# Installer et configurer l’application sur son serveur

Cette application est un client web indépendant pour les films et séries de Jellyfin 12. Elle se connecte à votre serveur existant ; elle n’héberge ni les médias ni les demandes. Aucun abonnement ni clé administrateur à distribuer aux utilisateurs.

## Première connexion

1. Hébergez le paquet web compilé sur votre serveur HTTP, avec le fichier `config.json` du paquet (voir DEVELOPMENT.md). Utilisez HTTPS pour les accès distants. N’embarquez aucune session ou donnée de votre serveur dans le paquet.
2. Ouvrez l’application, indiquez l’adresse complète de votre Jellyfin, puis connectez-vous avec votre compte ou Quick Connect.
3. Le compte administrateur voit **Paramètres → Serveur**. Les autres comptes ne voient que leurs préférences, leurs réglages de lecture et leur compte. Les droits réels restent contrôlés par Jellyfin.
4. Les profils mémorisés appartiennent à ce navigateur. L’administrateur n’est pas mémorisé comme un profil partagé.

## Retrouver les réglages

**Vos préférences** regroupe Apparence, Lecteur, Langues, Qualité, Bibliothèque, Demandes et Compte. Chaque carte indique si le réglage concerne ce navigateur, l’appareil ou votre compte Jellyfin. Les réglages de compte se retrouvent dans les autres applications Jellyfin ; les choix d’apparence restent propres au client.

**Serveur** regroupe une vue d’ensemble et trois extensions optionnelles. Leur absence n’empêche pas la consultation et la lecture de votre bibliothèque. Bibliothèques, utilisateurs, transcodage et tâches planifiées restent accessibles dans l’administration Jellyfin, depuis la vue d’ensemble.

## Installer une extension depuis les paramètres

1. Ouvrez sa page dans **Serveur**. L’état précise si elle est absente, active, désactivée, en erreur ou en attente de redémarrage.
2. Cliquez sur **Installer**. L’application cherche l’extension dans les catalogues déjà configurés sur votre Jellyfin.
3. Si elle est absente des catalogues, renseignez l’adresse HTTPS du manifeste Jellyfin publié par son mainteneur. Ce catalogue doit être joignable par votre serveur, pas seulement par le navigateur. N’ajoutez qu’un catalogue de confiance.
4. Confirmez l’installation. Les autres catalogues sont conservés.
5. Une fois le paquet téléchargé, confirmez séparément le redémarrage. L’application indique les lectures en cours et attend le retour du serveur. L’installation seule ne redémarre jamais automatiquement Jellyfin.

**Distribution actuelle :** Moonbase dispose de son catalogue officiel proposé par l’application. Native Previews et Movie Sources nécessitent un paquet compatible et un catalogue fourni par leur mainteneur ou hébergé par vous. Cette branche ne publie aucun catalogue ni paquet. Sans ce catalogue, l’installation automatique de ces deux plugins chez un ami n’est pas encore autonome. Vous pouvez aussi les installer selon les instructions de leur dépôt ; leur configuration devient ensuite accessible ici.

Pour proposer vos catalogues dans un paquet déployé, `config.json` accepte :

```json
{
  "clientPluginRepositories": {
    "previews": "https://plugins.example.org/previews/manifest.json",
    "movieSources": "https://plugins.example.org/sources/manifest.json"
  }
}
```

Ces URL sont des exemples à remplacer. Les manifestes doivent proposer les bons GUID, versions compatibles et sommes de contrôle ; les fichiers DLL ne sont jamais envoyés par le navigateur.

## Extraits vidéo : Native Previews

Dans **Serveur → Extraits vidéo**, choisissez l’activation, le choix automatique des scènes, la pause pendant les lectures, l’encodeur, les threads du processeur et le temps maximal par encodage. Réglez également le cache, la réserve d’espace libre et la rétention. Le choix automatique peut révéler l’intrigue ; il est désactivé par défaut.

Dans **Scènes et extraits**, recherchez un film, une série ou un épisode local. Choisissez le début et une durée de 1 à 30 secondes. Une série peut utiliser l’épisode source de votre choix (par défaut, saison 1 épisode 1). Validez explicitement **Scène approuvée pour diffusion** puis **Approuver et préparer**. Vous pouvez aussi enregistrer une scène sans la diffuser.

**Importer un extrait** accepte une vidéo approuvée de 1 à 30 secondes, de 32 Mo maximum. L’import remplace la scène du titre choisi ; il ne remplace jamais le média de la bibliothèque. Le serveur vérifie le fichier puis prépare ses deux qualités. L’état de la scène apparaît dans la liste des scènes enregistrées. Une erreur peut provenir du codec, du fichier source, de l’espace libre ou de l’encodeur ; vérifiez les journaux côté serveur sans publier vos données privées.

Chaque personne choisit ensuite dans **Apparence** si les extraits sont affichés et si leur son est activé. Les images de survol de la barre du lecteur (trickplay) constituent une fonction différente, configurée dans les bibliothèques Jellyfin.

## Demandes : Seerr et Moonbase

Installez et configurez d’abord votre instance Seerr (ou Jellyseerr), reliée à votre Jellyfin et à vos gestionnaires de médias. Dans **Serveur → Demandes**, installez Moonbase puis indiquez l’adresse de Seerr telle que **Jellyfin** peut la joindre. Dans Docker, `localhost` représente le conteneur courant : utilisez le nom réseau ou l’adresse IP joignable.

Cliquez sur **Enregistrer et tester**. L’application utilise la session Jellyfin et Quick Connect via Moonbase ; aucune clé Seerr n’est demandée dans le client. Chaque utilisateur doit disposer des droits et du compte correspondants dans Seerr. Il peut désactiver les découvertes dans sa propre section **Demandes**. Les autres fonctions propres à Moonbase restent dans l’administration de ce plugin.

## Sources disponibles : Movie Sources et Prowlarr

Dans **Serveur → Sources**, activez la recherche, indiquez l’adresse de Prowlarr joignable par Jellyfin et sa clé API. La clé déjà enregistrée n’est jamais réaffichée ni conservée dans le cache de requêtes du client. Laissez le champ vide pour la garder ; saisissez une nouvelle clé pour la remplacer.

**Enregistrer**, puis **Tester la recherche**, vérifie une recherche de film. Les indications de langues et de disponibilité restent indicatives : une source publiée ne garantit ni sa qualité, ni sa langue réelle, ni un téléchargement réussi. Les quotas et droits de demande continuent à s’appliquer dans Seerr.

## Vérifications avant de partager l’adresse

Essayez un compte non administrateur, une lecture et sa reprise, puis les fonctions optionnelles installées. Ne distribuez pas votre fichier de session, des identifiants, des médias privés ou des avatars dont vous ne possédez pas les droits. Les illustrations privées de la démonstration ne sont pas incluses dans le client.
