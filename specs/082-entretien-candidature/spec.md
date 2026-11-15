# Spec — Rendez-vous d'entretien après une candidature au service

- **Numéro** : 082
- **Statut** : Validée
- **Créée le** : 2026-11-15
- **Branche suggérée** : `feat/entretien-candidature`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Depuis la spec 077, une personne qui veut servir remplit la fiche « Servir » et l'équipe
**Vie des STAR (PVS)** l'étudie dans Koinonia. Avant d'orienter la personne vers un département,
un membre du PVS la rencontre en **entretien**. Ce rendez-vous se fixe aujourd'hui hors de
Koinonia, par téléphone ou par messagerie, après plusieurs allers-retours : la fiche attend, le
candidat ne sait pas quand il sera reçu, et rien ne garde la trace du rendez-vous.

Retour de recette (novembre 2026) : le PVS souhaite proposer lui-même des **créneaux
d'entretien**, tenus à jour selon les disponibilités de ses membres, et que la personne
**choisisse son créneau** juste après avoir envoyé sa fiche.

## Utilisateurs concernés

- **Candidat (sans compte)** : après l'envoi de sa fiche, choisit un créneau d'entretien parmi
  ceux proposés, ou passe l'étape ; retrouve, change ou annule son rendez-vous par le lien reçu par
  email, jusqu'à 24 heures avant.
- **Équipe PVS** (membres d'un département de fonction « Vie des STAR ») :
  - crée, modifie et retire les créneaux d'entretien de son église, un par un ou en série, avec
    pour chacun la date, l'heure, la durée, le lieu (sur place ou en visio) et le membre du PVS
    qui reçoit ;
  - voit pour chaque créneau s'il est libre ou réservé, et par qui ;
  - voit sur chaque candidature le rendez-vous choisi ou « À planifier » ; fixe, déplace ou
    annule un rendez-vous pour le candidat, à tout moment ;
  - note qu'un entretien a eu lieu ou que la personne n'est pas venue.
- **Membre du PVS qui reçoit** (désigné sur le créneau) : est prévenu quand son créneau est
  réservé, déplacé ou annulé, et reçoit un rappel la veille. Il voit déjà la fiche, comme toute
  l'équipe PVS.
- **Admin d'église / Super Admin** : mêmes droits que le PVS sur les créneaux et les rendez-vous
  de leur église.
- **Autres rôles** (Secrétaire, Ministre, Resp. département, STAR, Faiseur de Disciples,
  Reporter, Comptable, Référent soins pastoraux) : aucun accès aux créneaux ni aux rendez-vous.

## Comportement attendu

### Scénario principal

1. Les membres du PVS se répartissent les entretiens. Dans « Candidatures », un membre ouvre la
   gestion des créneaux et crée en une fois une série : tous les mardis de décembre, de 19 h à
   21 h, créneaux de 30 minutes, « Salle 2 », reçus par Jean. Il ajoute un créneau isolé le jeudi
   10 à 20 h en visio (lien de visio), reçu par Sarah.
2. Marie remplit la fiche « Servir » et l'envoie. L'écran de confirmation lui propose aussitôt
   les créneaux libres à venir, avec la date, l'heure, la durée, le lieu et le nom de la personne
   qui la recevra.
3. Marie choisit mardi 2 décembre, 19 h 30, avec Jean. Le créneau est aussitôt réservé : il n'est
   plus proposé à personne d'autre.
4. Marie reçoit un email de confirmation avec la date, l'heure, le lieu, le nom de Jean et un lien
   pour retrouver, changer ou annuler son rendez-vous.
5. L'équipe PVS est notifiée de la nouvelle candidature et du rendez-vous choisi ; Jean est
   prévenu qu'un entretien lui est réservé.
6. La veille, Marie reçoit un rappel par email et Jean un rappel par notification.
7. Après l'entretien, Jean note sur la candidature « entretien réalisé », puis le PVS poursuit le
   parcours de la spec 077 (validation et orientation vers un département).

### Scénarios alternatifs / cas limites

- **Aucun créneau libre** au moment de l'envoi : la fiche est bien enregistrée et le candidat voit
  « Aucun créneau n'est disponible pour le moment ; vous recevrez un email dès que de nouveaux
  créneaux seront proposés ». La candidature est marquée « À planifier ».
- **Aucun créneau ne lui convient** : le candidat choisit « Aucun créneau ne me convient » ; la
  fiche est enregistrée, la candidature est marquée « À planifier » et le PVS le recontacte.
- **Nouveaux créneaux ouverts** : les candidats « À planifier » dont la candidature est encore
  à l'étude reçoivent un email les invitant à choisir un créneau par leur lien. Un seul email par
  vague de créneaux ajoutés, jamais plus d'un par jour à une même personne.
- **Deux personnes choisissent le même créneau en même temps** : une seule l'obtient ; l'autre voit
  que le créneau vient d'être pris et choisit parmi les créneaux encore libres.
- **Le candidat change de créneau** par son lien, au plus tard 24 heures avant son rendez-vous :
  l'ancien créneau redevient libre, le nouveau est réservé, le PVS et les membres qui reçoivent
  (ancien et nouveau) sont prévenus.
- **Le candidat annule** son rendez-vous, au plus tard 24 heures avant : le créneau redevient
  libre ; la candidature reste enregistrée, marquée « À planifier ».
- **Moins de 24 heures avant** : le lien affiche le rendez-vous sans permettre de le changer ni de
  l'annuler, et invite à contacter le PVS (adresse email du PVS si elle est renseignée).
- **Le PVS déplace ou retire un créneau déjà réservé** : le candidat est prévenu par email et
  invité à choisir un autre créneau par son lien ; le membre qui reçoit est prévenu.
- **Le PVS change la personne qui reçoit** sur un créneau réservé : le nouveau et l'ancien membre
  sont prévenus ; le candidat reçoit un email avec le nouveau nom, sans autre changement.
- **La personne ne vient pas** : le PVS note « absent » ; il peut l'inviter à choisir un nouveau
  créneau (le candidat reçoit un email avec son lien).
- **Un créneau est passé** : il n'est plus proposé ; un créneau passé non réservé disparaît des
  créneaux à venir.
- **La candidature n'est pas retenue** ou est effacée au terme de sa conservation (spec 077) : son
  rendez-vous à venir est annulé, le créneau redevient libre, le membre qui reçoit est prévenu. Le
  candidat non retenu reçoit un message neutre : « Votre rendez-vous est annulé ; l'équipe vous
  recontactera », sans motif. Une candidature effacée ne déclenche aucun message.
- **Lien perdu** : le candidat peut redemander le lien de son rendez-vous à l'adresse email de sa
  fiche, avec la même réponse que l'adresse soit connue ou non.
- **Membre du PVS qui quitte l'équipe** : il ne peut plus être désigné ; ses créneaux à venir
  restent affichés au PVS comme « à réattribuer » jusqu'à ce qu'une autre personne soit désignée.

### Statuts

**Rendez-vous** (un par essai ; une candidature garde l'historique de tous ses rendez-vous) :

| Statut | Quand |
|---|---|
| **Réservé** | Un créneau est choisi, l'entretien est à venir |
| **À compléter** | L'heure de fin est passée et l'issue n'a pas encore été notée |
| **Réalisé** | Le PVS a noté que l'entretien a eu lieu |
| **Absent** | La personne n'est pas venue sans prévenir |
| **Excusé** | La personne a prévenu qu'elle ne viendrait pas (typiquement moins de 24 heures avant, quand elle ne peut plus annuler elle-même) |
| **Annulé** | Annulé par le candidat, par le PVS, ou parce que la candidature n'est pas retenue ou est effacée — le motif d'annulation est conservé |

**Repère sur la candidature** : tant qu'aucun rendez-vous n'est réservé ni réalisé, la
candidature est **« À planifier »**, avec sa raison :

- aucun créneau disponible à l'envoi de la fiche ;
- aucun créneau ne convenait au candidat ;
- rendez-vous annulé par le candidat ;
- créneau déplacé ou retiré par le PVS ;
- absent ou excusé, à reprogrammer.

Un rendez-vous **réalisé** retire le repère. Un entretien réalisé n'est **jamais exigé** pour
valider une candidature : le PVS peut valider sans entretien (personne déjà connue, par exemple).
Aucun statut ne change seul vers « réalisé » ou « absent » : l'issue est toujours notée par une
personne.

### Relances au PVS

- **Issue à noter** : le lendemain d'un entretien resté « À compléter », le membre qui a reçu est
  notifié ; le PVS voit un compteur des entretiens à compléter.
- **Candidature à planifier** : une candidature encore à l'étude qui reste « À planifier » depuis
  14 jours (délai réglable dans les paramètres des candidatures) déclenche une notification à
  l'équipe PVS, puis une nouvelle tous les 14 jours tant que rien ne change. La notification ne
  contient que le prénom et le nom du candidat et la raison du repère.
- **Absences répétées** : deux absences d'affilée sont signalées en évidence sur la candidature.

### Ce que voit chacun

- **Candidat** : la date, l'heure, la durée, le lieu (ou le lien de visio) et le prénom et le nom
  de la personne du PVS qui le reçoit.
- **PVS et Admin** : tous les créneaux (libres, réservés, passés), et pour un créneau réservé le
  nom du candidat avec un lien vers sa candidature.
- **Membre qui reçoit** : en plus de la vue de l'équipe PVS, ses propres entretiens à venir.

## Critères d'acceptation

- [ ] L'équipe PVS (et l'Admin) peut créer, modifier et retirer des créneaux d'entretien pour son
      église, chacun avec une date, une heure, une durée (30 minutes par défaut), un lieu sur place
      ou un lien de visio, et un membre du PVS désigné.
- [ ] Une série de créneaux se crée en une fois (jours, plage horaire, durée) et chaque créneau de
      la série reste modifiable seul.
- [ ] Après l'envoi de la fiche « Servir », le candidat se voit proposer les créneaux libres à
      venir, avec le nom de la personne qui reçoit, et peut en choisir un ou passer l'étape.
- [ ] Un créneau ne reçoit qu'un seul candidat ; deux réservations simultanées du même créneau
      n'aboutissent jamais toutes les deux.
- [ ] Le candidat reçoit un email de confirmation avec la date, l'heure, le lieu, le nom de la
      personne qui reçoit et un lien pour retrouver, changer ou annuler son rendez-vous.
- [ ] Le candidat peut changer ou annuler jusqu'à 24 heures avant ; au-delà, le lien l'invite à
      contacter le PVS. Changer ou annuler libère l'ancien créneau.
- [ ] Sans créneau choisi, la fiche est enregistrée et la candidature est « À planifier » pour le
      PVS.
- [ ] L'ouverture de nouveaux créneaux prévient par email les candidats « À planifier » encore
      à l'étude, au plus une fois par jour.
- [ ] La veille, le candidat reçoit un rappel par email et le membre qui reçoit un rappel par
      notification.
- [ ] Le PVS voit le rendez-vous en cours et l'historique des rendez-vous de chaque candidature,
      peut fixer, déplacer ou annuler un rendez-vous pour le candidat, et noter « réalisé »,
      « absent » ou « excusé ».
- [ ] Un rendez-vous passé sans issue notée apparaît « À compléter » ; le membre qui a reçu est
      notifié le lendemain et le PVS voit le nombre d'entretiens à compléter.
- [ ] Une candidature sans rendez-vous réservé ni réalisé affiche « À planifier » avec sa raison
      (aucun créneau disponible, aucun ne convenait, annulé par le candidat, créneau retiré,
      absent ou excusé).
- [ ] Une candidature encore à l'étude restée « À planifier » 14 jours (délai réglable) déclenche
      une notification à l'équipe PVS, renouvelée tous les 14 jours tant que rien ne change.
- [ ] Deux absences d'affilée sont signalées sur la candidature.
- [ ] Valider une candidature n'exige pas d'entretien réalisé ; aucun statut ne passe seul à
      « réalisé » ou « absent ».
- [ ] Déplacer ou retirer un créneau réservé prévient le candidat et l'invite à en choisir un autre.
- [ ] Une candidature non retenue libère son créneau à venir et le candidat reçoit un message
      d'annulation neutre ; une candidature effacée libère son créneau sans message.
- [ ] Aucun rôle hors PVS, Admin et Super Admin ne voit les créneaux ni les rendez-vous.
- [ ] Les notifications ne contiennent que le prénom et le nom du candidat, jamais d'autre donnée
      de la fiche.
- [ ] Toute création, modification ou suppression de créneau et tout changement de rendez-vous par
      le PVS sont journalisés.

## Hors périmètre

- **Synchronisation avec un agenda externe** (Google Agenda, Outlook…) : le PVS reporte les
  disponibilités de ses membres dans Koinonia.
- **Saisie de leurs disponibilités par les membres eux-mêmes** sous forme d'agenda personnel : le
  PVS tient les créneaux à jour (n'importe quel membre du PVS peut le faire).
- **Entretien avec un responsable de département** : l'entretien est mené par le PVS ; la suite du
  parcours avec le département reste celle de la spec 077.
- **Entretien collectif** : un créneau reçoit un seul candidat.
- **Visioconférence intégrée** : un lien de visio est saisi, sans création automatique de réunion.
- **Compte rendu d'entretien** : seule la mention « réalisé » ou « absent » est notée ; les
  observations restent dans le champ existant de la candidature.
- **Invitation d'agenda** (fichier à ajouter à son calendrier) : pas dans ce lot.

## Décisions (questions tranchées le 2026-11-15)

- **Qui reçoit** : un membre du PVS, désigné sur chaque créneau.
- **Où** : un lieu de l'église ou un lien de visio, selon le créneau.
- **Places** : un seul candidat par créneau.
- **Choix du créneau** : facultatif ; « Aucun créneau ne me convient » laisse la candidature
  « À planifier ».
- **Changer ou annuler** : par le candidat jusqu'à 24 heures avant ; le PVS à tout moment.
- **Rappel** : la veille, au candidat (email) et au membre qui reçoit (notification).
- **Nom affiché** : le candidat voit le prénom et le nom de la personne qui le reçoit.
- **Nouveaux créneaux** : les candidats « À planifier » encore à l'étude sont prévenus par
  email, au plus une fois par jour.
- **Candidature non retenue** : message d'annulation neutre, sans motif.
- **Saisie en série** : disponible dès ce lot.
- **Durée par défaut** : 30 minutes, modifiable sur chaque créneau.
- **Statuts** : réservé, à compléter, réalisé, absent, excusé, annulé (avec motif) ; repère
  « À planifier » avec sa raison sur la candidature ; historique conservé ; deux absences d'affilée
  signalées.
- **Relance « À planifier »** : à 14 jours (réglable), puis tous les 14 jours, à l'équipe PVS ;
  issue d'entretien à noter signalée le lendemain au membre qui a reçu.

## Questions ouvertes

- Aucune bloquante.
