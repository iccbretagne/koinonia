# Spec — Changer l'icône de l'application depuis Koinonia

- **Numéro** : 069
- **Statut** : Implémentée
- **Créée le** : 2026-10-27
- **Branche suggérée** : `feat/icone-application`
- **Prolonge** : [spec 068 — notifications natives](../068-notifications-push/spec.md) (icônes de
  l'application installée et des notifications)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

L'icône de Koinonia est celle qu'on voit :

- sur l'écran d'accueil du téléphone quand l'application est installée ;
- dans l'onglet du navigateur ;
- dans les notifications natives (spec 068).

Aujourd'hui, la changer demande une intervention dans le code et une nouvelle version. C'est
lourd pour un geste d'identité visuelle, et c'est impossible pour une organisation qui
installerait sa propre instance de Koinonia sans développeur.

L'icône vaut pour **toute l'instance** : l'application installée est liée à une adresse web, que
toutes les églises de l'instance partagent. Ce n'est donc pas un réglage d'église mais un
réglage de **plateforme**.

## Utilisateurs concernés

- **Super Admin** : seul à pouvoir déposer, remplacer ou retirer l'icône de l'application.
- **Tous les autres rôles** (Admin, Secrétaire, Ministre, Resp. département, STAR, Faiseur de
  Disciples, Reporter, Référent soins pastoraux, Comptable), ainsi que les visiteurs des pages
  publiques : ils voient l'icône en vigueur, sans pouvoir la changer.

Un Admin d'église ne peut pas la changer : elle s'impose à toutes les églises de l'instance.

## Comportement attendu

### Écran « Icône de l'application »

Dans l'administration de la plateforme, un écran réservé au Super Admin montre :

- l'**icône en vigueur**, et si c'est l'icône par défaut de Koinonia ou une icône déposée ;
- un **aperçu** de ce que verront les utilisateurs :
  - écran d'accueil d'un iPhone (coins arrondis) ;
  - écran d'accueil Android (forme ronde) ;
  - onglet du navigateur, en petit ;
  - notification Android (petite silhouette monochrome) ;
- un bouton **« Déposer une icône »** et, si une icône est déposée, **« Revenir à l'icône par
  défaut »**.

### Déposer une icône

- **Formats acceptés** : image carrée PNG, JPEG ou WebP, de 512 × 512 pixels au moins
  (1024 × 1024 conseillé), et de 5 Mo au plus.
- Avant enregistrement, l'aperçu montre l'image dans toutes les formes, pour vérifier que rien
  d'important n'est rogné, par exemple un texte près du bord sur Android.
- Une **aide** rappelle les règles d'une bonne icône :
  - sujet centré, avec une marge (Android découpe en rond) ;
  - fond plein, la transparence étant remplacée par une couleur de fond ;
  - pas de petit texte, illisible à la taille d'un onglet.
- Les **coins transparents ou clairs** d'une image déjà arrondie sont remplis avec une couleur de
  fond, pour que l'icône reste pleine sur iPhone. Cette couleur est proposée d'après l'image et
  reste modifiable.
- À l'enregistrement, Koinonia prépare toutes les tailles nécessaires. La nouvelle icône
  s'applique pour **tout le monde** : onglet, notifications, installation de l'application.

### Retirer l'icône

« Revenir à l'icône par défaut » rétablit l'icône livrée avec Koinonia, après confirmation.

### Traçabilité

Déposer, remplacer ou retirer l'icône est **inscrit dans l'historique** de la plateforme, avec
l'auteur et la date.

### Scénario principal

1. Le Super Admin reçoit le nouveau visuel de l'équipe Communication, une image carrée de
   1024 pixels.
2. Il ouvre « Icône de l'application », dépose l'image et regarde l'aperçu. Sur la forme ronde
   d'Android, le texte du bas est rogné ; il décide de garder quand même cette image.
3. L'image a des coins blancs arrondis : Koinonia propose de les remplir avec le violet du fond,
   et il valide.
4. Il enregistre. Un message confirme que la nouvelle icône est en place, et rappelle que les
   iPhone qui ont déjà installé Koinonia doivent la réinstaller pour la voir.
5. Dans l'heure, les notifications et les onglets affichent la nouvelle icône.

### Scénarios alternatifs / cas limites

- **Image refusée** avec un message explicite, sans rien changer à l'icône en vigueur :
  - image non carrée ;
  - image trop petite ;
  - format non accepté (SVG, GIF, PDF…) ;
  - fichier trop lourd ;
  - fichier qui n'est pas une image.
- **Application déjà installée sur iPhone** : son icône ne change pas d'elle-même ; c'est une
  limite de l'iPhone. L'écran le dit clairement, et suggère un message aux utilisateurs :
  supprimer Koinonia de l'écran d'accueil puis la réajouter.
- **Application installée sur Android** : l'icône se met à jour d'elle-même, en général sous
  quelques jours ; l'écran l'indique.
- **Badge des notifications Android** : c'est une silhouette blanche, que l'on ne peut pas tirer
  automatiquement de n'importe quelle image. Le Super Admin peut déposer **en plus**, s'il le
  souhaite, une silhouette dédiée (forme blanche sur fond transparent, PNG). Sans silhouette
  déposée, un **badge générique** (une cloche) s'affiche ; le badge livré avec Koinonia reste
  utilisé tant que l'icône par défaut est en vigueur.
- **Échec de préparation** des tailles (image corrompue) : l'icône en vigueur est conservée, et
  un message dit que l'image n'a pas pu être utilisée.
- **Deux Super Admin** déposent une icône presque en même temps : la dernière enregistrée
  l'emporte, et les deux dépôts figurent dans l'historique.
- **Nouvelle version de Koinonia** : une icône déposée est conservée, et n'est jamais écrasée
  par une mise à jour.

## Critères d'acceptation

- [x] Seul un Super Admin accède à l'écran « Icône de l'application » ; un Admin d'église ou
  tout autre rôle se le voit refuser, même par adresse directe.
- [x] Une image PNG, JPEG ou WebP carrée d'au moins 512 px et d'au plus 5 Mo est acceptée ; un
  SVG, une image non carrée, trop petite, trop lourde, ou un fichier qui n'est pas une image est
  refusé avec un message explicite, et l'icône en vigueur ne change pas.
- [x] Une silhouette de badge peut être déposée en plus (PNG avec transparence) ; sans elle, le
  badge des notifications est une cloche générique.
- [x] L'aperçu montre l'image en forme iPhone, Android ronde, onglet et notification avant
  l'enregistrement.
- [x] Les coins transparents ou clairs d'une image arrondie sont remplis d'une couleur de fond,
  proposée et modifiable.
- [x] Après enregistrement, l'onglet du navigateur, l'icône d'installation et l'icône des
  notifications sont celles déposées, pour tous les utilisateurs et toutes les églises.
- [x] « Revenir à l'icône par défaut » rétablit l'icône livrée avec Koinonia.
- [x] Déposer, remplacer et retirer l'icône apparaissent dans l'historique avec l'auteur et la
  date.
- [x] L'écran explique que l'iPhone ne met pas à jour une application déjà installée, et
  qu'Android le fait en quelques jours.
- [x] Une mise à jour de Koinonia ne remplace pas une icône déposée.
- [x] Le fichier déposé n'est jamais servi tel quel : seules les versions préparées par Koinonia
  sont visibles.

## Hors périmètre

- Une icône **par église** : impossible pour une application installée, liée à une seule
  adresse.
- Changer le **nom** de l'application, sa couleur de thème ou l'écran de démarrage.
- Changer le **logo** affiché dans l'interface (barre latérale, page de connexion), ou le logo
  d'église de la page « Donner », qui a déjà son propre réglage (spec 066).
- Recadrer ou retoucher l'image dans Koinonia (zoom, déplacement) : l'image se prépare avant le
  dépôt.
- Programmer un changement d'icône à une date donnée.
- Prévenir automatiquement les utilisateurs du changement.

## Décisions

- **Badge** : dépôt facultatif d'une silhouette dédiée ; à défaut, badge générique (cloche).
- **Emplacement** : Administration › bloc « Plateforme », à côté de « Sauvegardes » et « API ».

## Questions ouvertes

- Aucune.
