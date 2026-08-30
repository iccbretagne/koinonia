# Spec — Cycle de vie des offres d'emploi : relance puis archivage automatique

- **Numéro** : 034
- **Statut** : Implémentée
- **Créée le** : 2026-08-30
- **Branche suggérée** : `feat/cycle-vie-offres-emploi`
- **Issue** : [#465](https://github.com/iccbretagne/koinonia/issues/465)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Contexte & problème

La section **« Offres »** rassemble les offres d'emploi, de stage et d'alternance partagées
par les membres. N'importe quel utilisateur connecté peut en publier une ; elle apparaît
aussitôt dans la liste, visible de tous.

**Une offre publiée le reste indéfiniment.** Rien ne vérifie qu'elle est toujours
d'actualité, rien ne relance son auteur, rien ne la retire. Or une offre d'emploi a une
durée de vie courte par nature : le poste est pourvu, la campagne de recrutement se ferme,
l'entreprise change d'avis — et personne ne pense à revenir dans l'application pour le
signaler.

Le coût est double :

- **Pour celui qui cherche** : il repère une offre, prépare une candidature, écrit — et
  n'obtient rien, parce que le poste est pourvu depuis quatre mois. Quelques déceptions de
  ce type suffisent à ce qu'on cesse de consulter la section : une liste dont on doute
  n'est plus consultée, et les offres réellement actives ne trouvent plus personne.
- **Pour celui qui publie** : son offre valide se noie au milieu d'offres mortes.

**Une nuance de l'existant.** Une offre peut porter une **date limite de candidature**
facultative. Quand cette date est dépassée, l'offre **disparaît déjà** de la liste — mais
elle reste enregistrée comme « publiée » : ni archivée, ni comptabilisée comme telle, elle
subsiste indéfiniment dans un entre-deux invisible. Le manque concerne donc surtout les
offres **sans date limite**, qui restent visibles sans fin ; mais le nettoyage doit aussi
solder ces offres à date limite dépassée restées « publiées ».

Ce qu'on veut : **que l'auteur reste maître de son offre, sans que son silence bloque
tout le monde**. On ne supprime pas, on ne devine pas — on demande, on attend, et à défaut
de réponse on retire de la liste ce qu'on ne peut plus garantir.

Un mécanisme comparable existe déjà dans l'application pour les suivis MSDP restés
inactifs : relance datée, mémorisée pour ne pas se répéter, déclenchée par un traitement
périodique. La cohérence de comportement avec celui-ci est recherchée.

## Utilisateurs concernés

La section Offres est **transversale à la plateforme** : une offre n'appartient à aucune
église et reste visible de tous les utilisateurs connectés. Il n'y a donc aucun périmètre
d'église à appliquer, et aucun contexte d'église pour personnaliser une relance.

| Qui | Ce qui le concerne |
|---|---|
| **L'auteur d'une offre** — n'importe quel rôle, puisque tous peuvent publier (Super Admin, Admin, Secrétaire, Ministre, Resp. département, STAR, Faiseur de Disciples, Reporter…) | Reçoit la relance, confirme que son offre est toujours d'actualité, ou la laisse s'archiver |
| **Super Admin**, **Admin**, **Secrétaire** — qui modèrent déjà les offres | Peuvent confirmer ou archiver une offre dont ils ne sont pas l'auteur, comme aujourd'hui |
| **Tous les utilisateurs connectés** | Bénéficient d'une liste d'offres à jour — c'est la finalité de la feature |

Aucun droit n'est créé ni modifié : la feature s'appuie sur qui peut déjà agir sur une
offre.

## Comportement attendu

### Scénario principal — l'offre reste d'actualité

1. Un membre publie une offre. Elle apparaît dans la liste.
2. Pendant **60 jours**, rien ne se passe : l'offre vit sa vie, personne n'est dérangé.
3. Au 60ᵉ jour, l'auteur reçoit une **relance par email et une notification dans
   l'application** : son offre est-elle toujours d'actualité ? Le message indique
   clairement **ce qui se passera s'il ne fait rien** — l'offre sera archivée — et **à
   quelle date**.
4. L'email le renvoie vers la page de son offre. Il s'y connecte et clique sur
   **« Toujours d'actualité »**.
5. L'offre repart pour un **nouveau cycle de 60 jours**. Elle n'a jamais quitté la liste,
   et l'auteur ne sera pas relancé d'ici là.

### Scénario — l'offre n'est plus d'actualité

1. Même relance au 60ᵉ jour. L'auteur, dont le poste est pourvu, ne fait rien.
2. **14 jours plus tard**, l'offre est **archivée automatiquement** : elle disparaît de la
   liste consultable.
3. L'auteur n'a aucune démarche à faire : ne rien faire *est* la réponse « ce n'est plus
   d'actualité ». C'est le comportement voulu — on ne demande pas un effort à quelqu'un
   pour retirer quelque chose qu'il a oublié.

### Scénario — l'auteur se ravise

1. Une offre a été archivée faute de réponse.
2. Son auteur la retrouve et la **republie** — la fonction existe déjà et reste inchangée.
3. L'offre redevient visible et **repart pour un cycle complet de 60 jours**, comme une
   offre neuve. Elle n'est pas relancée immédiatement au prétexte qu'elle était en retard.

### Scénario — la mise en service

1. Le jour où le mécanisme entre en service, des offres publiées depuis plus de 60 jours
   existent déjà.
2. Elles sont **relancées**, pas archivées : leurs auteurs reçoivent la demande de
   confirmation et disposent de leurs 14 jours, exactement comme pour une offre récente.
   Aucune offre n'est archivée le jour de la mise en service.
3. Les auteurs concernés reçoivent chacun **une seule** relance, même si plusieurs de
   leurs offres sont anciennes — une par offre, jamais en double pour la même offre.

### Statut de l'offre archivée

Une offre archivée faute de réponse prend le **même statut d'archivage** qu'une offre que
son auteur a retirée volontairement. Aucun statut nouveau : pour celui qui consulte, une
offre archivée est une offre archivée. La trace de la relance restée sans réponse suffit à
retracer le pourquoi si la question se pose.

### Scénarios alternatifs / cas limites

- **Si une offre est déjà archivée**, elle n'est ni relancée, ni archivée une seconde fois.
  Le mécanisme ne s'intéresse qu'aux offres publiées.
- **Si le traitement automatique s'exécute plusieurs fois** dans la période de 14 jours,
  l'auteur ne reçoit **pas** de relance à chaque passage : une relance envoyée est
  mémorisée et ne se répète pas pour la même offre.
- **Si l'auteur confirme son offre**, toute trace de relance en cours est effacée : il
  repart d'une page blanche et sera relancé 60 jours plus tard, pas avant.
- **Si l'auteur modifie son offre**, cela **vaut confirmation** : la prochaine relance est
  repoussée de 60 jours et toute relance en cours est effacée, exactement comme s'il avait
  cliqué sur « Toujours d'actualité ». Quelqu'un qui vient de retoucher son offre s'est
  manifestement occupé d'elle ; le relancer trois jours plus tard serait du bruit. Le
  risque inverse — prolonger une offre périmée par une retouche cosmétique — est
  théorique : on ne retouche pas une offre dont on ne s'occupe plus.
- **Si une offre porte une date limite déjà dépassée**, elle est archivée par le mécanisme
  sans attendre le cycle de relance : sa date limite dit déjà qu'elle n'est plus valide, et
  elle a de toute façon disparu de la liste. On ne dérange pas son auteur pour lui demander
  de confirmer une échéance qu'il a lui-même fixée.
- **Si l'auteur n'a pas d'adresse email exploitable**, la notification dans l'application
  est tout de même créée, et le cycle suit son cours normalement.
- **Si l'envoi de l'email échoue**, cela ne doit ni interrompre le traitement des autres
  offres, ni empêcher l'offre concernée de suivre son cycle.
- **Si une offre est supprimée** entre la relance et l'échéance, il ne se passe rien : pas
  d'erreur, pas de message.
- **Si un modérateur** (Super Admin, Admin, Secrétaire) confirme ou archive une offre dont
  il n'est pas l'auteur, l'action produit le même effet que si l'auteur l'avait faite.
- **L'action « Toujours d'actualité » n'est proposée qu'à qui peut déjà agir sur
  l'offre** — son auteur, ou un modérateur. Pas à un utilisateur connecté quelconque.

## Critères d'acceptation

- [ ] Une offre publiée depuis **60 jours ou plus** sans confirmation déclenche une relance
      de son auteur.
- [ ] La relance est envoyée **à la fois** par email **et** en notification dans
      l'application.
- [ ] Le message de relance indique **ce qui se passera sans réaction** et **la date
      d'échéance**.
- [ ] Une offre relancée depuis **14 jours ou plus** sans confirmation passe
      **automatiquement au statut archivé** et disparaît de la liste consultable.
- [ ] Une offre archivée automatiquement porte le **même statut** qu'une offre archivée
      volontairement — aucun statut nouveau n'est introduit.
- [ ] L'auteur d'une offre relancée dispose, sur la page de son offre, d'une action
      **« Toujours d'actualité »**.
- [ ] Cette action **repousse la prochaine relance de 60 jours** et efface la relance en
      cours : l'offre n'est plus sur la trajectoire d'archivage.
- [ ] **Modifier une offre** produit le même effet qu'une confirmation explicite :
      prochaine relance repoussée de 60 jours, relance en cours effacée.
- [ ] Cette action est proposée **à l'auteur et aux modérateurs** (Super Admin, Admin,
      Secrétaire), et **à personne d'autre**.
- [ ] Une tentative de confirmation par un utilisateur qui n'est ni auteur ni modérateur
      est **refusée**, même en contournant l'interface.
- [ ] Une **offre déjà archivée** n'est ni relancée ni ré-archivée.
- [ ] Deux exécutions successives du traitement automatique **n'envoient pas deux relances**
      pour la même offre.
- [ ] Une offre **republiée** après archivage repart pour un cycle complet de 60 jours et
      n'est pas relancée immédiatement.
- [ ] Une offre dont la **date limite est dépassée** est archivée sans passer par le cycle
      de relance.
- [ ] Un **échec d'envoi d'email** n'interrompt pas le traitement des autres offres.
- [ ] Une offre dont l'auteur **n'a pas d'email exploitable** reçoit tout de même sa
      notification dans l'application et suit son cycle.
- [ ] Le traitement automatique s'exécute **sans intervention humaine**, à intervalle
      régulier.
- [ ] Le traitement **rend compte de ce qu'il a fait** (nombre de relances envoyées, nombre
      d'offres archivées), afin qu'un dysfonctionnement soit visible.
- [ ] **Le jour de la mise en service**, les offres anciennes déjà publiées sont
      **relancées**, et **aucune n'est archivée**.

## Hors périmètre

- **La republication d'une offre archivée** : la fonction existe déjà (bascule
  « Archiver » / « Republier » sur la page d'une offre) et n'est pas modifiée.
- **Les autres sections du module emploi** : missions freelance, profils freelance et
  profils de recherche d'emploi ne reçoivent aucun mécanisme de cycle de vie.
- **Le message récapitulatif WhatsApp** des offres (issue #464) : demande distincte.
- **Toute modification des droits** de publication, de modération ou de consultation des
  offres.
- **Un écran d'administration** du cycle de vie (liste des offres relancées, forçage
  manuel, réglage des délais par l'utilisateur) : les délais sont fixés, non paramétrables.
- **La suppression définitive** d'une offre : le mécanisme archive, il ne supprime jamais.
- **Une relance de l'auteur après archivage** (« votre offre a été archivée ») : la relance
  a déjà eu lieu avant, on n'ajoute pas un second message.
- **Le nettoyage des offres archivées anciennes** (purge de l'historique).
- **Toute modification de la liste des offres** au-delà de l'effet mécanique de l'archivage
  sur son contenu.

## Questions ouvertes

*Toutes tranchées le 2026-08-30 :*

- **Délais** → **60 jours** de vie tranquille, puis relance, puis **14 jours** avant
  archivage. Un délai de réponse de 14 jours absorbe une absence ou des congés, là où 7
  jours ferait archiver des offres encore valides.
- **Canal de relance** → **email et notification dans l'application**. C'est justement un
  auteur qui ne se connecte plus qu'on cherche à toucher : l'email l'atteint hors de
  l'application, la notification lui rappelle à sa prochaine visite.
- **Confirmation** → **depuis l'application**, via un bouton sur la page de l'offre ;
  l'email y renvoie. Pas de lien à usage unique : on n'ouvre pas de route publique ni de
  jeton pour ce besoin.
- **Statut** → l'offre archivée faute de réponse prend le **statut d'archivage existant**,
  identique à un retrait volontaire. Aucun statut nouveau à propager partout où le statut
  est testé.
- **Modification vaut confirmation** → **oui**. Repousse la relance de 60 jours et efface
  la relance en cours, comme l'action explicite.

---

*Étape suivante : `/plan`.*
