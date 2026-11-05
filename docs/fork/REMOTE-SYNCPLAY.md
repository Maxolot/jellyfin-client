# Lire sur un autre appareil et regarder ensemble

Le client utilise les moteurs de télécommande et SyncPlay de Jellyfin avec ses
propres panneaux. Aucun plugin serveur supplémentaire n’est requis.

## Lire sur…

Ouvrir le menu du profil → **Lire sur un autre appareil**, ou le bouton de diffusion
dans le lecteur. La liste contient uniquement les sessions Jellyfin vidéo que le serveur autorise ce
compte à contrôler. Le serveur décide des droits : l’application ne contourne pas
les restrictions entre utilisateurs.

Choisir un appareil le rend destinataire des prochaines lectures depuis les fiches.
Depuis une lecture locale, ce choix envoie le titre et sa position au nouvel appareil,
puis arrête le lecteur local après acceptation de la demande. L’autre appareil doit
être connecté et son navigateur doit autoriser la lecture automatique.

La barre inférieure ouvre la télécommande : lecture/pause, position, précédent/suivant,
volume et son, pistes audio et sous-titres disponibles, arrêt. Les curseurs acceptent
le clavier et le toucher. Le déplacement tactile prévisualise la position et n’envoie
la commande qu’au relâchement. Les touches répétées s’accumulent avant les réponses
de l’appareil.

**Revenir sur ce navigateur** change la destination des prochaines lectures. Cette
action ne coupe pas la lecture sur l’autre appareil ; utiliser **Arrêter la lecture**
pour cela. Lorsqu’un rapport serveur confirme que l’appareil a disparu, la destination
revient au navigateur. En cas de coupure réseau, un message remplace toute prétention
à disposer d’un état récent ; le client tente de relire les informations.

## Regarder ensemble

Ouvrir le menu du profil → **Regarder ensemble**. Le droit Jellyfin `SyncPlayAccess`
détermine si le compte peut créer et rejoindre un groupe, seulement le rejoindre,
ou n’a pas accès à cette fonction. Le serveur conserve le dernier mot sur chaque
requête, notamment l’accès aux bibliothèques.

Créer un groupe, puis le rejoindre depuis un autre appareil/compte. Une pastille
**Ensemble** indique le nombre de participants et ouvre les informations du groupe,
y compris depuis le lecteur. Lancer ensuite un titre depuis sa fiche : le moteur
SyncPlay partage la file et synchronise la lecture, la pause et les déplacements.
**Pause pour tous** et **Reprendre pour tous** commandent le groupe, et ne se limitent
pas à arrêter le lecteur local. **Quitter le groupe** retire uniquement cette session.

Les deux modes s’excluent : quitter le groupe avant de choisir un lecteur distant,
ou revenir à la lecture dans ce navigateur avant de rejoindre un groupe.

## Compatibilité et limites

La télécommande s’appuie sur les capacités déclarées par les sessions Jellyfin et
leurs comptes. Elle ne découvre pas directement les appareils DLNA ou AirPlay et ne
remplace pas une application compatible sur la télévision. Le contrôle de lecture
peut être limité par l’appareil destinataire.

Les événements du moteur assurent les mises à jour rapides ; une relecture des
sessions toutes les deux secondes garde un repli lorsque ces événements manquent.
Les réponses obsolètes sont ignorées après un changement d’appareil ou de compte.
Une sélection en cours ne peut arrêter un ancien lecteur local après un retour au
navigateur ou un changement de compte/destination. Une commande déjà acceptée par le
serveur avant cette annulation peut toutefois avoir démarré sur l’autre appareil.

Le navigateur peut refuser un démarrage automatique, notamment sur Safari/iPad :
un premier geste utilisateur dans chaque navigateur peut être nécessaire. Les
limites de réseau et de mise en veille demeurent celles de Jellyfin et du navigateur.
La synchronisation sur de vrais iPad/TV reste à vérifier sur ces appareils.

## Validation

Les essais utilisent uniquement un Jellyfin 12 isolé, des médias synthétiques et
des comptes temporaires ; aucun appareil ni compte de production n’est contrôlé.
Voir STATUS.md pour les résultats datés. Les scénarios privés ne sont pas distribués
avec des données de connexion.
