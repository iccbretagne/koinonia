# Spec — Prévenir les personnes planifiées d'un changement ou d'une suppression d'événement

- **Numéro** : 059
- **Statut** : Validée
- **Créée le** : 2026-10-03
- **Branche suggérée** : `feat/notifier-changement-evenement`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

L'audit des notifications (octobre 2026) a relevé un trou : quand l'administration déplace un
événement d'église (autre jour, autre heure) ou le supprime, **personne n'est prévenu**. Un STAR
planifié pour servir découvre le changement en ouvrant son planning — ou ne le découvre pas et
se présente à la mauvaise heure, ou pour un culte annulé. Ses responsables de département,
qui ont composé l'équipe, ne sont pas prévenus non plus et ne peuvent pas réagir (vérifier que
l'équipe reste disponible, réorganiser).

Aujourd'hui seul un effet indirect existe : depuis la spec 058, déplacer un événement pendant
une collecte de disponibilités relance la question « Êtes-vous disponible ? » aux membres des
départements concernés. Ce message ne dit pas que l'événement a bougé, ne concerne pas les
personnes déjà planifiées en tant que telles, et n'existe pas hors collecte ni pour une
suppression.

## Utilisateurs concernés

- **STAR planifié** sur l'événement (en service, en service avec débrief, ou remplaçant), dont
  la fiche est liée à un compte : reçoit la notification.
- **Responsable de département** (principal et adjoints) des départements dont au moins un
  membre est planifié sur l'événement : reçoit la notification, avec le récapitulatif des
  personnes de son département concernées.
- **Ministre** du ministère auquel appartient au moins un de ces départements : reçoit la
  notification, avec le récapitulatif par département de son ministère.
- **Super Admin, Admin, Secrétaire** (`events:manage`), ou toute personne qui fait approuver une
  demande de modification ou d'annulation d'événement : déclenchent le changement. Rien ne
  change pour eux, sinon le message de confirmation (voir critères).
- Les autres rôles ne sont pas concernés.

## Comportement attendu

### Scénario principal — déplacement

1. Le culte du dimanche 8 novembre à 10h a une équipe planifiée : 3 STAR de Louange, 2 de
   l'Accueil (dont un remplaçant).
2. Le Secrétaire décale le culte à 10h30.
3. Les 5 STAR planifiés reçoivent une notification dans l'application et, selon leur préférence
   « Planning et service », un email : « Culte du dimanche 8 novembre : l'horaire change —
   10h00 → 10h30. Vous êtes toujours planifié. Si vous ne pouvez plus servir, prévenez votre
   responsable. » Le lien ouvre leur planning.
4. Les responsables de Louange et de l'Accueil, ainsi que les Ministres des ministères
   concernés, reçoivent une notification équivalente indiquant combien de personnes de leurs
   départements sont concernées.
5. L'auteur du changement ne reçoit rien, même s'il est lui-même planifié ou responsable.

### Scénario principal — suppression

1. Le même culte est supprimé (directement, ou par approbation d'une demande d'annulation).
2. Les STAR planifiés, leurs responsables et les Ministres concernés reçoivent : « Culte du dimanche 8 novembre à
   10h00 : l'événement est annulé. Votre service est retiré de votre planning. »

### Scénarios alternatifs / cas limites

- **Changement de titre, de type, de délai de planification, de réglages (annonces, comptes
  rendus, discipolat…)** sans changement de date ni d'heure : aucune notification.
- **Événement sans personne planifiée** : aucune notification (pas même aux responsables).
- **Événement passé** (déplacé ou supprimé après sa date d'origine) : aucune notification —
  c'est un nettoyage, pas une information utile.
- **Série d'événements** (changement d'horaire propagé à toute la série, ou suppression de
  plusieurs événements à la fois) : chaque personne reçoit **une seule** notification qui
  récapitule les événements qui la concernent, et non une par événement.
- **Personne planifiée dans plusieurs départements** du même événement : une seule
  notification.
- **Responsable ou Ministre lui-même planifié**, ou à la fois responsable et Ministre : une
  seule notification (celle d'encadrant, qui inclut sa propre affectation et tous ses
  départements concernés).
- **STAR planifié sans compte lié** : pas de notification (rien à qui l'adresser) ; son
  responsable et son Ministre, eux, sont prévenus et le voient dans le récapitulatif.
- **Personne marquée indisponible** sur l'événement : n'est pas « planifiée », pas de
  notification à ce titre.
- **Déplacement pendant une collecte de disponibilités** : la notification de changement part
  immédiatement ; la nouvelle question de disponibilité de la spec 058 continue de partir
  comme aujourd'hui. Le STAR planifié peut donc recevoir les deux, mais la notification de
  changement est la seule à dire ce qui a changé.
- **Préférence email** : l'email suit la préférence « Planning et service » de chaque
  destinataire (activée par défaut) ; la notification dans l'application part toujours.
- **Multi-église** : seules les personnes de l'église de l'événement sont concernées.

## Critères d'acceptation

- [ ] Déplacer un événement à venir (date ou heure) notifie chaque STAR planifié lié à un compte
      (en service, en service avec débrief, remplaçant), avec l'ancienne et la nouvelle date/heure.
- [ ] Supprimer un événement à venir notifie de la même façon, avec la mention « annulé ».
- [ ] Les responsables (principal et adjoints) de chaque département ayant au moins une
      personne planifiée sont notifiés, avec le nombre de personnes concernées.
- [ ] Les Ministres des ministères de ces départements sont notifiés, avec le récapitulatif
      par département.
- [ ] Le comportement est identique que le changement soit fait directement ou par
      approbation d'une demande de modification/annulation.
- [ ] Un changement de titre, de type, de délai ou de réglage seul ne notifie personne.
- [ ] Un événement passé ou sans personne planifiée ne notifie personne.
- [ ] Une modification de série ou une suppression groupée produit une seule notification par
      destinataire.
- [ ] Personne ne reçoit deux notifications pour le même changement ; l'auteur n'en reçoit aucune.
- [ ] L'email respecte la préférence « Planning et service » ; le contenu de l'email est le même
      que celui de la notification (un seul email par destinataire).
- [ ] Après le changement, l'auteur voit dans le message de confirmation combien de personnes
      ont été prévenues.
- [ ] Aucune personne d'une autre église n'est notifiée.

## Hors périmètre

- Les événements d'équipe (répétitions, réunions internes à un département) : leurs
  changements restent sans notification.
- Le retrait d'un département d'un événement, et les changements d'affectation dans la grille
  (déjà notifiés à la personne concernée).
- La notification de l'administration de l'église (Super Admin, Admin, Secrétaire) en tant que
  telle.
- Toute demande de confirmation (« Je serai là / Je ne peux plus ») : la personne prévient son
  responsable par les moyens habituels ou met à jour ses disponibilités.
- Les STAR sans compte (pas de SMS ni d'email hors compte).
- Le rattrapage des changements faits avant la mise en service.

## Questions ouvertes

Tranchées en revue (2026-10-03) :
- Encadrants notifiés : responsables de département **et** Ministres des ministères concernés.
- Aucune notification pour un événement passé.
- Domaine « Planning et service » (email activé par défaut), pas de nouveau domaine.
