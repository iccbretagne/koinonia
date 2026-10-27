# Spec — Messages système (annonces internes)

- **Numéro** : 071
- **Statut** : Validée
- **Créée le** : 2026-10-27
- **Branche suggérée** : `feat/messages-systeme`
- **S'appuie sur** : [spec 053 — préférences de notification](../053-preferences-notifications-email/spec.md)
  et [spec 068 — notifications natives](../068-notifications-push/spec.md)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Pour prévenir les utilisateurs de Koinonia, l'administration n'a aujourd'hui que WhatsApp ou
l'email, hors de l'application :

- une maintenance prévue ;
- une nouvelle version et ses nouveautés ;
- un rappel administratif (« mettez à jour vos disponibilités avant dimanche ») ;
- une consigne ponctuelle (« le parking est fermé ce dimanche »).

Le message n'atteint pas tout le monde. Il se noie dans les conversations, et rien ne dit qui l'a
vu. Et il n'est pas là où les gens travaillent, c'est-à-dire dans Koinonia.

Il faut pouvoir publier un **message système** depuis Koinonia :

- adressé à un public précis ;
- visible en bandeau pendant la période choisie ;
- relayé par la cloche, l'email et les notifications sur l'appareil, selon les préférences de
  chacun.

## Utilisateurs concernés

| Rôle | Ce qu'il peut faire |
|---|---|
| **Super Admin** | Publier un message pour **toute l'instance** (toutes les églises) ou pour une église. Voir, modifier et retirer tous les messages. |
| **Admin** | Publier, modifier et retirer les messages de **son église**. Voir leur historique et leurs statistiques. |
| **Secrétaire** | Comme l'Admin, dans **son église**. |
| **Tous les rôles** (Ministre, Resp. département, STAR, Faiseur de Disciples, Reporter, Référent soins pastoraux, Comptable, Admin, Secrétaire) | **Recevoir** les messages qui les visent : bandeau, cloche, et email ou appareil selon leurs préférences. |

Un Ministre ou un Resp. département ne publie pas de message système. Les échanges propres à un
département relèvent d'autres canaux, comme les consignes ou les événements d'équipe.

## Comportement attendu

### Rédiger un message

Un écran « Messages système » liste les messages : en cours, programmés et passés. Le bouton
**« Nouveau message »** ouvre un formulaire :

- **Titre** : court, affiché dans le bandeau et la notification.
- **Texte** : quelques lignes, avec un lien facultatif (« En savoir plus »).
- **Sévérité** :
  - **Information** : neutre ;
  - **Important** : mis en avant ;
  - **Urgent** : couleur d'alerte. Il ne se ferme pas et l'email part même si la personne a
    coupé les emails de ce type de message.
- **Public** :
  - **Toute l'instance** : Super Admin seulement ;
  - **Toute l'église** ;
  - **Par rôle** : un ou plusieurs rôles, par exemple « Responsables de département et
    Ministres » ;
  - **Par ministère ou département** : un ou plusieurs.
  - Les critères se combinent, par exemple « Resp. département du ministère Louange ». Le
    formulaire affiche **le nombre de personnes visées** avant la publication.
- **Période** :
  - **date et heure de début** : maintenant ou plus tard ;
  - **date et heure de fin** : obligatoire, pour qu'aucun bandeau ne reste indéfiniment.
- **Aperçu** du bandeau et de la notification avant la publication.

### Ce que voient les personnes visées

- **Le bandeau** : pendant la période, il s'affiche en haut de toutes les pages de Koinonia, sur
  mobile comme sur ordinateur, avec le titre, le début du texte et « Lire ».
  - Une croix le ferme pour cette personne, sur tous ses appareils.
  - **Urgent** n'a pas de croix : le bandeau disparaît à la fin de la période.
  - Si plusieurs messages sont en cours, le plus grave s'affiche en premier, avec la mention
    « 1 sur 3 ».
- **La notification** : au début de la période, une notification arrive dans la cloche. Elle part
  aussi :
  - par email et sur l'appareil selon les préférences de la personne, pour un nouveau type « Messages
    de l'administration », réglable dans « Mes notifications » ;
  - **toujours par email** pour un message Urgent, même si la personne a coupé ce type de
    message. L'appareil continue de suivre sa préférence.
- **Le détail du message** s'ouvre depuis le bandeau ou la notification : titre, texte complet,
  lien, auteur (« Secrétariat de l'église » ou « Administration de Koinonia ») et date.

### Suivi pour l'auteur

Pour chaque message :

- le nombre de **personnes visées** ;
- le nombre de personnes qui l'ont **vu** (bandeau affiché ou détail ouvert) ;
- le nombre de personnes qui l'ont **fermé**.

Aucune liste nominative n'est affichée : le suivi reste global.

### Modifier, retirer, historique

- Un message **programmé** se modifie librement.
- Un message **en cours** :
  - son titre, son texte et sa date de fin se corrigent ; le public et la sévérité restent
    fixes ;
  - une correction ne renvoie pas de notification ;
  - **« Retirer maintenant »** met fin au bandeau immédiatement.
- Les messages **passés** restent consultables avec leurs statistiques.
- Publier, modifier et retirer un message sont **inscrits dans l'historique**, avec l'auteur et la
  date.

### Scénario principal

1. La Secrétaire prépare une maintenance prévue samedi soir. Elle crée un message « Important » :
   « Koinonia indisponible samedi de 22h à 23h ». Public : toute l'église. Période : de mercredi
   9h à samedi 23h.
2. Le formulaire indique « 142 personnes visées ». Elle vérifie l'aperçu et publie.
3. Mercredi à 9h, le bandeau apparaît pour les 142 personnes, et une notification arrive dans
   leur cloche. Ceux qui l'ont choisi la reçoivent aussi par email ou sur leur téléphone.
4. Un STAR ouvre Koinonia, lit le bandeau et le ferme. Il ne le revoit plus, ni sur son téléphone
   ni sur son ordinateur.
5. Jeudi, la Secrétaire consulte le message : « 142 visées · 96 vues · 61 fermées ».
6. Samedi à 23h, le bandeau disparaît pour tous.

### Scénarios alternatifs / cas limites

- **Message programmé** : rien n'est visible avant l'heure de début. La notification part à cette
  heure-là, pas à la publication.
- **Message Urgent** (« Culte de dimanche déplacé au gymnase ») :
  - bandeau sans croix ;
  - email envoyé même aux personnes qui ont coupé ce type de message ;
  - notification sur l'appareil selon la préférence.
- **Message pour toute l'instance** (Super Admin, « Nouvelle version de Koinonia ») : toutes les
  églises le reçoivent. Les Admins et Secrétaires le voient dans leur liste, en lecture seule.
- **Personne qui rejoint le public pendant la période** (nouveau compte, nouveau rôle, nouveau
  département) : elle voit le bandeau à sa prochaine visite, sans notification rétroactive.
- **Personne sans compte** (fiche STAR non liée) : elle ne reçoit rien. Le formulaire le signale
  par la mention « N STAR sans compte ne recevront pas ce message ».
- **Plusieurs églises** : une personne qui a des rôles dans deux églises voit les messages des
  deux, sans doublon pour un message d'instance.
- **Fin avant le début**, ou **date de fin dépassée** : la publication est refusée avec un message
  clair.
- **Public vide** (aucun compte ne correspond) : la publication est refusée.
- **Retrait d'un message programmé** : il ne s'affiche jamais et aucune notification ne part.
- **Écran verrouillé** : le texte d'une notification sur l'appareil est celui de la cloche,
  conformément à la spec 068. L'auteur est averti qu'un message système ne doit pas contenir
  d'information sensible.

## Critères d'acceptation

- [ ] Un Super Admin publie un message pour toute l'instance ou pour une église ; un Admin ou une
  Secrétaire, seulement pour leur église. Tout autre rôle se voit refuser l'écran, même par
  adresse directe.
- [ ] Le public se règle par église entière, par rôle et par ministère ou département, avec des
  critères combinables. Le nombre de personnes visées s'affiche avant la publication.
- [ ] Le bandeau s'affiche pendant la période, et seulement pour les personnes visées, en haut de
  toutes les pages, sur mobile et sur ordinateur.
- [ ] Un message Information ou Important se ferme et ne revient pas pour cette personne, sur
  aucun de ses appareils. Un message Urgent ne se ferme pas.
- [ ] Au début de la période, une notification arrive dans la cloche de chaque personne visée.
- [ ] L'email et l'appareil suivent la préférence du type « Messages de l'administration ». Un message Urgent
  part par email même si cette préférence est coupée.
- [ ] Un message programmé n'est ni visible ni notifié avant son début ; il disparaît à sa fin.
- [ ] La date de fin est obligatoire et postérieure au début ; un public vide est refusé.
- [ ] Pour chaque message, l'auteur voit le nombre de personnes visées, de vues et de fermetures,
  sans liste nominative.
- [ ] Un message en cours se corrige (titre, texte, fin) sans nouvelle notification et se retire
  immédiatement. Un message programmé se modifie librement.
- [ ] Publier, modifier et retirer un message apparaissent dans l'historique, avec l'auteur et la
  date.
- [ ] Un message d'une église n'est jamais visible depuis une autre église.

## Hors périmètre

- Une messagerie ou un échange de réponses : le message va dans un seul sens.
- Des messages publiés par un Ministre ou un Resp. département à leur équipe.
- Envoyer à des personnes sans compte : SMS, WhatsApp, email hors compte.
- Une liste nominative des personnes qui ont vu ou fermé un message.
- Une mise en forme riche (images, pièces jointes, tableaux) au-delà d'un texte simple et d'un
  lien.
- Des messages récurrents, comme un rappel automatique chaque mois.
- Traduire les messages.
- Une confirmation de lecture obligatoire (« J'ai lu et j'accepte »).

## Questions ouvertes

- Aucune. Décisions prises avec l'utilisateur :
  - **Ciblage par département** : le message vise à la fois les **membres** (STAR dont la fiche
    est rattachée au département et liée à un compte) et les **responsables** du département.
    L'option « Responsables seulement » permet de restreindre aux responsables.
  - **Nom du type de notification** : « Messages de l'administration ».
  - La Secrétaire publie comme l'Admin.
  - Un message Urgent passe outre la préférence email ; l'appareil suit toujours la préférence.
