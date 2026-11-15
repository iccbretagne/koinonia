# Spec — Rendez-vous d'entretien après une candidature au service

- **Numéro** : 082
- **Statut** : Brouillon
- **Créée le** : 2026-11-15
- **Branche suggérée** : `feat/entretien-candidature`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Depuis la spec 077, une personne qui veut servir remplit la fiche « Servir » et l'équipe
**Vie des STAR (PVS)** l'étudie dans Koinonia. Avant d'orienter la personne vers un département,
le PVS la rencontre en **entretien**. Ce rendez-vous se fixe aujourd'hui hors de Koinonia, par
téléphone ou par messagerie, après plusieurs allers-retours : le PVS doit d'abord demander leurs
disponibilités aux responsables qui mènent les entretiens, puis trouver un moment qui convient
au candidat. La fiche attend, le candidat ne sait pas quand il sera reçu, et rien ne garde la
trace du rendez-vous.

Retour de recette (novembre 2026) : le PVS souhaite proposer lui-même des **créneaux
d'entretien**, tenus à jour selon les disponibilités que les responsables lui donnent, et que la
personne **choisisse son créneau** juste après avoir envoyé sa fiche.

## Utilisateurs concernés

- **Candidat (sans compte)** : après l'envoi de sa fiche, choisit un créneau d'entretien parmi
  ceux proposés ; le retrouve, le change ou l'annule par le lien reçu par email.
- **Équipe PVS** (membres d'un département de fonction « Vie des STAR ») :
  - crée, modifie et retire les créneaux d'entretien de son église, avec pour chacun la date,
    l'heure, la durée, le lieu et la personne qui mène l'entretien ;
  - voit pour chaque créneau s'il est libre ou réservé, et par qui ;
  - voit sur chaque candidature le rendez-vous choisi ; peut fixer, déplacer ou annuler un
    rendez-vous pour le candidat ;
  - note qu'un entretien a eu lieu (ou que la personne n'est pas venue).
- **Personne qui mène l'entretien** (un responsable, désigné sur le créneau) : est prévenue
  quand son créneau est réservé, déplacé ou annulé. [À CLARIFIER : voit-elle la fiche du
  candidat avant l'entretien ? Aujourd'hui, un responsable ne voit une fiche qu'après une
  affectation à son département.]
- **Admin d'église / Super Admin** : mêmes droits que le PVS sur les créneaux et les rendez-vous
  de leur église.
- **Autres rôles** (Secrétaire, Ministre, Resp. département non désigné, STAR, Faiseur de
  Disciples, Reporter, Comptable, Référent soins pastoraux) : aucun accès aux créneaux.

## Comportement attendu

### Scénario principal

1. Les responsables qui mènent les entretiens donnent leurs disponibilités au PVS, comme
   aujourd'hui (oralement ou par message).
2. Dans « Candidatures », le PVS ouvre la gestion des créneaux et crée par exemple trois créneaux
   la semaine suivante : mardi 19 h 00, mardi 19 h 30, jeudi 20 h 00, d'une durée de 30 minutes,
   « Salle 2 » ; il choisit pour chacun le responsable qui recevra le candidat.
3. Marie remplit la fiche « Servir » et l'envoie. L'écran de confirmation lui propose aussitôt
   les créneaux libres à venir, avec la date, l'heure et le lieu.
4. Marie choisit mardi 19 h 30. Le créneau est aussitôt réservé : il n'est plus proposé à
   personne d'autre.
5. Marie reçoit un email de confirmation avec la date, l'heure, le lieu et un lien pour
   retrouver, changer ou annuler son rendez-vous.
6. L'équipe PVS est notifiée de la nouvelle candidature et du rendez-vous choisi ; le
   responsable désigné sur le créneau est prévenu qu'un entretien lui est réservé, sans autre
   détail que le prénom et le nom du candidat.
7. La veille, Marie et le responsable reçoivent un rappel. [À CLARIFIER : rappel souhaité, et
   quand ?]
8. Après l'entretien, le PVS note sur la candidature « entretien réalisé », puis poursuit le
   parcours de la spec 077 (validation et orientation vers un département).

### Scénarios alternatifs / cas limites

- **Aucun créneau libre** au moment de l'envoi : la fiche est bien enregistrée et le candidat
  voit « Aucun créneau n'est disponible pour le moment ; l'équipe vous recontactera ». Le PVS voit
  la candidature « sans rendez-vous ». [À CLARIFIER : le candidat est-il prévenu par email dès
  que de nouveaux créneaux sont ouverts, ou seulement recontacté par le PVS ?]
- **Aucun créneau ne lui convient** : le candidat peut passer cette étape (« Aucun créneau ne me
  convient ») ; la candidature est marquée « sans rendez-vous » et le PVS le recontacte.
  [À CLARIFIER : cette option est-elle souhaitée, ou le choix d'un créneau est-il obligatoire ?]
- **Deux personnes choisissent le même créneau en même temps** : une seule l'obtient ; l'autre
  voit que le créneau vient d'être pris et choisit parmi les créneaux encore libres.
- **Le candidat change de créneau** par son lien : l'ancien créneau redevient libre, le nouveau
  est réservé, le PVS et les responsables concernés sont prévenus. [À CLARIFIER : jusqu'à quand
  peut-il changer ou annuler (par exemple jusqu'à 24 h avant) ?]
- **Le candidat annule** son rendez-vous : le créneau redevient libre ; la candidature reste
  enregistrée, marquée « sans rendez-vous ».
- **Le PVS retire ou déplace un créneau déjà réservé** : le candidat est prévenu par email et
  invité à choisir un autre créneau par son lien ; le responsable est prévenu.
- **Le responsable désigné n'est plus disponible** : le PVS change le responsable du créneau ; le
  candidat n'est pas dérangé si la date, l'heure et le lieu ne changent pas.
- **La personne ne vient pas** : le PVS note « absent » ; il peut lui proposer un nouveau
  rendez-vous (le candidat reçoit un email pour choisir un autre créneau).
- **Un créneau est passé** : il n'est plus proposé ; un créneau passé non réservé disparaît de la
  liste des créneaux à venir.
- **La candidature n'est pas retenue** ou est effacée au terme de sa conservation (spec 077) : son
  rendez-vous à venir est annulé, le créneau redevient libre et le responsable est prévenu.
  [À CLARIFIER : le candidat non retenu reçoit-il un message d'annulation ?]
- **Lien perdu** : comme pour les autres formulaires publics, le candidat peut redemander le lien
  de son rendez-vous à l'adresse email de sa fiche, avec la même réponse que l'adresse soit
  connue ou non.

### Ce que voit chacun

- **Candidat** : la date, l'heure, la durée et le lieu du créneau. [À CLARIFIER : le nom de la
  personne qui mène l'entretien lui est-il affiché ?]
- **PVS et Admin** : tous les créneaux (libres, réservés, passés), et pour un créneau réservé le
  nom du candidat avec un lien vers sa candidature.
- **Responsable désigné** : ses créneaux réservés, avec le prénom et le nom du candidat.

## Critères d'acceptation

- [ ] L'équipe PVS (et l'Admin) peut créer, modifier et retirer des créneaux d'entretien pour son
      église, chacun avec une date, une heure, une durée, un lieu et un responsable désigné.
- [ ] Après l'envoi de la fiche « Servir », le candidat se voit proposer les créneaux libres à
      venir et peut en choisir un.
- [ ] Un créneau réservé n'est plus proposé à personne ; deux réservations simultanées du même
      créneau n'aboutissent jamais toutes les deux.
- [ ] Le candidat reçoit un email de confirmation avec la date, l'heure, le lieu et un lien pour
      retrouver, changer ou annuler son rendez-vous.
- [ ] Changer ou annuler un rendez-vous libère l'ancien créneau.
- [ ] Sans créneau libre (ou s'il n'en choisit aucun), la fiche est enregistrée et la candidature
      est marquée « sans rendez-vous » pour le PVS.
- [ ] Le PVS voit le rendez-vous (ou son absence) sur chaque candidature et peut fixer, déplacer
      ou annuler un rendez-vous pour le candidat.
- [ ] Le PVS peut noter qu'un entretien a eu lieu ou que la personne n'est pas venue.
- [ ] Le responsable désigné est prévenu quand un entretien lui est réservé, déplacé ou annulé,
      sans recevoir d'autre information que le prénom et le nom du candidat.
- [ ] Retirer ou déplacer un créneau réservé prévient le candidat et l'invite à en choisir un autre.
- [ ] Une candidature non retenue ou effacée libère son créneau à venir.
- [ ] Aucun rôle hors PVS, Admin, Super Admin et responsable désigné ne voit les créneaux ni les
      rendez-vous.
- [ ] Toute création, modification ou suppression de créneau et tout changement de rendez-vous par
      le PVS sont journalisés.

## Hors périmètre

- **Synchronisation avec un agenda externe** (Google Agenda, Outlook…) : les responsables
  continuent de donner leurs disponibilités au PVS, qui les reporte dans Koinonia.
- **Saisie de leurs disponibilités par les responsables eux-mêmes** : c'est le PVS qui tient les
  créneaux à jour (choix exprimé en recette). [À CLARIFIER : à confirmer pour plus tard.]
- **Créneaux récurrents** (« tous les mardis à 19 h ») : chaque créneau est créé un par un.
  [À CLARIFIER : une saisie en série est-elle nécessaire dès le départ ?]
- **Visioconférence intégrée** : un lien de visio peut figurer dans le lieu, sans création
  automatique de réunion.
- **Compte rendu d'entretien** : seule la mention « réalisé » ou « absent » est notée ; les
  observations restent dans le champ existant de la candidature.
- **Rendez-vous avec le département** après l'orientation : non couvert ici.

## Questions ouvertes

- [À CLARIFIER : **avec qui** se passe l'entretien — un membre du PVS, un responsable de
  département, ou l'un ou l'autre selon le créneau ?]
- [À CLARIFIER : **où** — un lieu de l'église, une visio, ou les deux selon le créneau ?]
- [À CLARIFIER : **combien de personnes** par créneau — une seule (entretien individuel) ou
  plusieurs (entretien collectif, avec un nombre de places) ?]
- [À CLARIFIER : le choix d'un créneau est-il **obligatoire**, ou le candidat peut-il passer
  l'étape et être recontacté ?]
- [À CLARIFIER : jusqu'à quand le candidat peut-il **changer ou annuler** son rendez-vous ?]
- [À CLARIFIER : **rappel** la veille (ou quelques heures avant) pour le candidat et pour le
  responsable ?]
- [À CLARIFIER : le **nom de la personne** qui mène l'entretien est-il affiché au candidat ?]
- [À CLARIFIER : la personne qui mène l'entretien **voit-elle la fiche** du candidat avant
  l'entretien ?]
- [À CLARIFIER : quand de **nouveaux créneaux** sont ouverts, les candidats « sans rendez-vous »
  sont-ils prévenus automatiquement ?]
- [À CLARIFIER : le candidat **non retenu** reçoit-il un message d'annulation de son rendez-vous ?]
- [À CLARIFIER : faut-il une **saisie en série** des créneaux (par exemple tous les mardis de
  décembre) ?]
