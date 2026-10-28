# Spec — Candidatures au service (fiche STAR)

- **Numéro** : 073
- **Statut** : Implémentée
- **Créée le** : 2026-10-28
- **Branche suggérée** : `feat/candidatures-service`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Une personne qui souhaite servir dans l'église remplit aujourd'hui une « fiche d'identité » sur
un formulaire Google. L'équipe **Pôle Vie des STAR (PVS)** la reçoit, l'étudie puis oriente la
personne vers un ou plusieurs départements. Rien de ce parcours n'est dans Koinonia : les fiches
vivent dans un tableur, circulent par email et par messagerie. Les départements reçoivent des
informations très personnelles (situation familiale, baptême, adresse, photo) sans contrôle de
qui les voit ni combien de temps elles sont gardées. L'issue de la période d'observation d'un
nouveau serviteur n'est tracée nulle part.

Jenny a proposé un premier module Koinonia : un formulaire public avec photo, enregistré en base,
dont un PDF est envoyé par email à l'équipe. Il fixe le contenu de la fiche, que cette spec
reprend. Il est en revanche écrit pour une seule église, il envoie la fiche en pièce jointe et
il n'offre aucun écran pour la consulter ou la suivre. Cette spec en fait un circuit complet dans
Koinonia, de la candidature à la confirmation du STAR dans son département.

## Utilisateurs concernés

- **Candidat (sans compte)** : remplit la fiche depuis l'adresse publique de son église.
- **Équipe PVS** (membres d'un département portant la fonction « Vie des STAR ») :
  - reçoit et étudie les candidatures, qu'elle est seule à voir avant validation ;
  - télécharge la fiche ;
  - valide la candidature et l'affecte à un ou plusieurs départements, ou ne la retient pas ;
  - traite les renvois des départements.
- **Resp. département** et **Ministre** du ministère du département :
  - voient la fiche d'un candidat affecté à leur département, et seulement après cette
    affectation ;
  - acceptent ou renvoient l'affectation ;
  - suivent la période d'observation et confirment le STAR ou le renvoient au PVS.
- **Admin d'église / Super Admin** : ont les mêmes droits que l'équipe PVS sur les candidatures
  de leur église (pour dépanner si l'équipe est vide ou absente). Ils règlent l'adresse email du
  PVS et la durée de conservation.
- **Responsable du département PVS** : règle aussi l'adresse email du PVS et la durée de
  conservation.
- **Le STAR lui-même**, une fois accueilli dans au moins un département et son compte lié à sa
  fiche STAR : consulte sa propre fiche en lecture seule (voir « Consultation par le STAR »).
- **Secrétaire, Faiseur de Disciples, Reporter, Comptable, Référent soins pastoraux, autres
  STAR** : aucun accès aux candidatures.

## Comportement attendu

### Les étapes d'une candidature

| Étape | Qui la voit | Qui agit |
|---|---|---|
| **Reçue** | PVS (+ Admin) | PVS : valide et affecte, ou ne retient pas |
| **Affectée** à un département (en attente d'accueil) | PVS + Resp./Ministre du département | Resp. ou Ministre : accepte ou renvoie au PVS |
| **En observation** (3 mois par défaut, réglable par le PVS) | PVS + Resp./Ministre du département | Resp. ou Ministre : confirme ou renvoie au PVS |
| **Confirmé** dans le département | PVS + Resp./Ministre du département | — |
| **Renvoyée au PVS** | PVS (+ le département qui a renvoyé garde une trace sans la fiche) | PVS : réaffecte ou ne retient pas |
| **Non retenue** | PVS | Effacée au terme de la durée de conservation |

Quand le candidat est affecté à plusieurs départements, chaque affectation suit ses étapes
« affectée → en observation → confirmé / renvoyé » indépendamment.

### Scénario principal

1. Marie ouvre l'adresse publique « Servir » de son église, reçue de l'équipe PVS.
2. Elle remplit sa fiche :
   - identité et photo ;
   - adresse et contact ;
   - parcours spirituel (baptême, église précédente, formations PCNC) ;
   - expérience de service, disponibilité et domaines d'intérêt ;
   - observations libres.
3. Elle coche la case de consentement. La page lui indique qui verra sa fiche et combien de temps
   elle est conservée si elle n'est pas retenue.
4. Elle envoie, puis voit une confirmation de réception.
5. L'équipe PVS reçoit une notification Koinonia, avec un email qui ne contient qu'un lien.
   L'adresse email du PVS reçoit le même email.
6. Un membre du PVS ouvre la candidature dans Koinonia. Il voit la fiche complète avec la photo
   et peut la télécharger en PDF.
7. Après entretien, il valide la candidature et l'affecte aux départements Accueil et Louange.
8. Les responsables d'Accueil et de Louange, et le Ministre de chaque ministère, sont notifiés et
   peuvent désormais voir la fiche de Marie.
9. Le responsable d'Accueil accepte l'affectation : la période d'observation commence (3 mois dans cette église).
   Marie devient STAR du département, marquée « en observation » : elle peut être planifiée.
10. Avant la fin de la période, le responsable reçoit un rappel. Il confirme Marie, qui devient
    STAR confirmée d'Accueil.
11. Marie se connecte à Koinonia et son compte est lié à sa fiche STAR. Dans « Mon profil », elle
    retrouve sa fiche de candidature et voit qu'elle est confirmée en Accueil.

### Scénarios alternatifs / cas limites

- **Renvoi pendant l'observation** : à tout moment de l'observation, le Resp. ou le Ministre peut
  renvoyer Marie au PVS avec un motif.
  - Le PVS est notifié.
  - Marie est retirée du département et n'y est plus planifiable (ses services déjà passés
    restent dans l'historique).
  - Ses autres affectations ne changent pas.
  - Le département qui a renvoyé ne voit plus la fiche, mais garde la trace du renvoi (date,
    motif, auteur).
- **Renvoi avant l'accueil** : le Resp. ou le Ministre peut refuser une affectation sans
  commencer l'observation. C'est un renvoi au PVS, avec motif.
- **Le PVS traite un renvoi** : il réaffecte à un autre département (nouvelle observation
  complète) ou marque la candidature « non retenue ».
- **Fin de l'observation sans décision** : pas de confirmation automatique. L'observation reste
  ouverte, signalée « échue », et le Resp. et le Ministre sont relancés jusqu'à ce que l'un d'eux
  confirme ou renvoie.
- **Non retenue** :
  - la candidature reste consultable par le PVS seul ;
  - elle est effacée, photo comprise, au terme de la durée de conservation : 1 an par défaut à
    partir de la décision, réglable par église ;
  - l'effacement est journalisé, sans les données personnelles.
- **Candidature jamais traitée** (restée « reçue ») : la même durée de conservation s'applique,
  à partir de la réception. Le PVS est prévenu un mois avant l'effacement.
- **Le candidat est déjà STAR** (fiche existante, par exemple dans un autre département) : au
  moment de la validation, le PVS rattache la candidature à la fiche existante au lieu d'en créer
  une nouvelle. Koinonia lui signale les fiches qui portent le même nom ou le même email.
- **Doublon de candidature** : deux envois de la même personne apparaissent tous les deux. Le
  PVS peut marquer l'un comme doublon (non retenu).
- **Église sans département PVS** : l'adresse publique affiche « formulaire non disponible »,
  comme les autres formulaires publics. Aucune candidature ne peut arriver sans personne pour la
  recevoir.
- **Église inconnue** : même réponse « non disponible ».
- **Photo** :
  - obligatoire ;
  - image courante (pas de SVG) de 8 Mo au plus ;
  - réencodée, ce qui retire les métadonnées comme la position GPS ;
  - refusée avec un message clair sinon.
- **Questions Oui/Non laissées sans réponse** : elles apparaissent « Non renseigné », jamais
  « Non ».
- **Robots et abus** : vérification anti-robots et limite d'envois, comme les autres formulaires
  publics. Un robot détecté reçoit un faux succès.
- **Responsable changé en cours d'observation** : le nouveau responsable voit la candidature et
  peut décider. L'ancien perd l'accès s'il n'est plus responsable ni Ministre du département.
- **Consultation et téléchargement** : chaque consultation et chaque téléchargement de la fiche
  est journalisé (qui, quand).

### Consultation par le STAR

- Dès qu'un département l'a accueilli (en observation ou confirmé), le STAR dont le compte est lié
  à sa fiche STAR retrouve sa fiche de candidature dans « Mon profil ».
- Il voit ses réponses, sa photo, peut télécharger le PDF, et voit ses départements avec leur
  étape (« en observation jusqu'au … », « confirmé »).
- Il ne voit jamais les informations internes : motifs de renvoi, affectations refusées ou
  renvoyées, journal des consultations, motif de non-retenue.
- Il ne peut pas modifier sa fiche : pour corriger une information, il s'adresse au PVS.
- Si tous ses départements l'ont renvoyé, il ne voit plus la fiche jusqu'à un nouvel accueil.

### Adresse email du PVS

- Le département PVS peut porter une adresse email de contact (la boîte de l'équipe).
- L'Admin d'église et le responsable du département PVS peuvent la saisir ou la modifier.
- Elle reçoit le même email que l'équipe PVS (lien seulement, sans pièce jointe) pour les
  nouvelles candidatures et les renvois. C'est une adresse institutionnelle : elle ne dépend
  d'aucune préférence personnelle.
- Sans adresse saisie, les notifications partent seulement aux personnes.

### Notifications

Elles ne contiennent jamais de donnée de la fiche au-delà du prénom et du nom, ni de pièce
jointe : un lien vers Koinonia suffit.

| Événement | Destinataires |
|---|---|
| Nouvelle candidature | Équipe PVS (+ adresse email du PVS) |
| Affectation à un département | Resp. et Ministre du département |
| Renvoi au PVS | Équipe PVS (+ adresse email du PVS) |
| Fin d'observation proche, puis échue | Resp. et Ministre du département |
| Effacement dans un mois d'une candidature jamais traitée | Équipe PVS |
| Confirmation | Équipe PVS |

## Critères d'acceptation

**Formulaire public**
- [x] Chaque église a sa propre adresse publique de candidature, qui affiche son nom.
- [x] Une église sans département PVS ou inconnue affiche « formulaire non disponible ».
- [x] La fiche comporte tous les champs du formulaire de Jenny.
- [x] Le consentement est obligatoire et la page annonce qui verra la fiche et la durée de
  conservation.
- [x] La photo est obligatoire et limitée à 8 Mo ; une image non valide est refusée avec un
  message.
- [x] Un envoi réussi affiche une confirmation.
- [x] La vérification anti-robots et la limite d'envois s'appliquent.

**Accès**
- [x] Avant affectation, seuls l'équipe PVS et l'Admin de l'église (et le Super Admin) voient et
  téléchargent la candidature.
- [x] Un Resp. ou Ministre ne voit une candidature qu'une fois affectée à son département, et ne
  la voit plus après un renvoi.
- [x] Une candidature d'une église n'est jamais visible depuis une autre église.
- [x] Le téléchargement PDF se fait depuis Koinonia, avec la photo.
- [x] Chaque consultation et chaque téléchargement est journalisé.

**Circuit**
- [x] Le PVS peut valider en affectant à un ou plusieurs départements, ou marquer « non
  retenue ».
- [x] Le Resp. ou le Ministre peut accepter une affectation : la personne devient STAR du
  département, marquée « en observation » et planifiable, pour la durée d'observation de
  l'église.
- [x] Le PVS (responsable du PVS) et l'Admin règlent la durée d'observation (3 mois par défaut) ;
  un changement ne modifie pas les observations en cours.
- [x] Un renvoi retire la personne du département concerné.
- [x] Sans décision à la fin de l'observation, l'observation passe « échue » et des relances partent
  jusqu'à une décision ; aucune confirmation automatique.
- [x] Le Resp. ou le Ministre peut renvoyer au PVS, avant ou pendant l'observation, avec un motif
  obligatoire. Les autres affectations ne changent pas.
- [x] Le Resp. ou le Ministre peut confirmer le STAR pendant l'observation.
- [x] Un rappel part avant la fin de l'observation.
- [x] Le PVS peut réaffecter une candidature renvoyée.
- [x] À la validation, le PVS peut rattacher la candidature à une fiche STAR existante, avec une
  suggestion des homonymes et des emails identiques.

**Notifications et email de département**
- [x] Les notifications du tableau ci-dessus partent, sans pièce jointe ni donnée sensible.
- [x] L'Admin d'église et le responsable du PVS peuvent saisir l'adresse email du PVS, qui reçoit
  les notifications de nouvelle candidature et de renvoi.

**Consultation par le STAR**
- [x] Un STAR accueilli dans au moins un département, compte lié à sa fiche, voit sa fiche de
  candidature dans « Mon profil », en lecture seule, avec le téléchargement PDF.
- [x] Il voit ses départements et leur étape, jamais les motifs de renvoi, les affectations
  renvoyées ni le journal.
- [x] Sans accueil en cours ou confirmé, ou sans compte lié, il ne voit rien.

**Conservation**
- [x] Une candidature non retenue est effacée, photo comprise, 1 an après la décision ; une
  candidature jamais traitée, 1 an après sa réception (PVS prévenu un mois avant).
- [x] La durée est réglable par église, par l'Admin ou le responsable du PVS.
- [x] L'effacement est journalisé sans donnée personnelle.

## Hors périmètre

- Reprise automatique des fiches du formulaire Google (resaisie manuelle si besoin).
- Suivi en ligne par le candidat **avant** son accueil dans un département : il n'a pas encore
  de compte lié à une fiche STAR.
- Modification de la fiche par le candidat ou le STAR après envoi (correction via le PVS).
- Formulaire personnalisable par église (champs, questions) : le contenu est celui proposé par
  Jenny.
- Statistiques des candidatures (volumes, délais, taux de confirmation) : lot ultérieur.
- Conservation des fiches des STAR confirmés : elles suivent les règles de la fiche STAR
  existante.
- Envoi de la fiche en pièce jointe par email : remplacé par le téléchargement depuis Koinonia.

## Décisions

- **D1** — Avant validation, l'Admin d'église et le Super Admin ont les mêmes droits que l'équipe
  PVS, pour dépanner.
- **D2** — L'adresse email concerne le seul département PVS ; l'Admin et le responsable du PVS la
  règlent.
- **D3** — Pendant l'observation, la personne est STAR du département, marquée « en
  observation » et planifiable ; un renvoi l'en retire.
- **D4** — Pas de confirmation automatique : une observation échue est relancée jusqu'à décision.
- **D5** — Une candidature jamais traitée suit la même durée de
  conservation, à partir de la réception.
- **D6** — La durée d'observation est réglable par église par le PVS (responsable du département
  PVS) et l'Admin d'église ; 3 mois par défaut. Un changement s'applique aux observations qui
  commencent ensuite, pas à celles en cours.
- **D7** — La durée de conservation est réglable par l'Admin d'église et par le responsable du
  PVS, l'un comme l'autre.
- **D8** — Une fois accueilli, le STAR consulte sa propre fiche en lecture seule dans « Mon
  profil », sans les informations internes du circuit.

## Questions ouvertes

- Aucune. Spec relue par Jenny (PVS) en parallèle du développement ; ses retours seront intégrés.
