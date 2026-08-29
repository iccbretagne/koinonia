# Spec — Autorisation objet des médias et des pièces comptables

- **Numéro** : 025
- **Statut** : Validée
- **Créée le** : 2026-08-29
- **Branche suggérée** : `fix/autorisation-objet-medias-comptabilite`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Contexte & problème

La spec 024 a corrigé les décisions d'autorisation prises **sur la mauvaise église**. Deux
défauts de même famille subsistent, mais à l'échelle de l'**objet** : l'accès est accordé sans
vérifier que l'objet visé appartient bien au périmètre de celui qui le demande. Les deux ont été
vérifiés dans le code, pas seulement repris de l'audit du 2026-08-29 (constats H-02 et H-03).

**1 — Un lien de validation média peut agir hors de son périmètre.**
Koinonia permet de partager un lien de validation à une personne **sans compte** (un pasteur, un
client, un responsable externe) pour qu'elle approuve ou écarte des photos. Ce lien est délégué
à un périmètre précis : soit un événement média, soit un projet média.

Le contrôle de périmètre n'est appliqué **que si** le lien porte un événement. Or un lien délégué
à un **projet** ne porte, par construction, aucun événement : pour lui, aucun contrôle n'a lieu.
Le porteur d'un tel lien peut donc désigner **n'importe quelle photo de la plateforme**, toutes
églises confondues, pour en obtenir l'original haute définition et pour en changer le statut
(approuvée / rejetée). Aucune vérification de rattachement à une église n'existe sur ce chemin,
y compris lorsque le lien porte bien un événement.

**2 — Une pièce justificative comptable peut être rattachée à la demande de quelqu'un d'autre.**
Lorsqu'un utilisateur soumet une demande de dépense, il peut y joindre des pièces justificatives.
Rien ne vérifie que les pièces qu'il désigne sont les siennes, qu'elles sont encore libres de tout
rattachement, ni qu'elles relèvent de son église.

Cela ouvre un enchaînement complet d'exfiltration : la personne crée une demande dans sa propre
église en y désignant la pièce justificative d'un tiers ; la pièce se retrouve rattachée à une
demande dont elle est l'auteur ; la consultation de cette pièce lui est alors accordée, puisque
le contrôle d'accès existant déduit l'église de la pièce depuis la demande à laquelle elle est
rattachée — rattachement que l'attaquant vient précisément de provoquer. Le justificatif d'une
autre personne, potentiellement d'une autre église, devient lisible.

À cela s'ajoute que la consultation d'une pièce justificative n'exige aujourd'hui **aucune
compétence comptable** : toute personne disposant d'un rôle quelconque dans l'église peut lire
la pièce attachée à la demande d'un tiers.

**Pourquoi maintenant** : ces deux défauts exposent des données personnelles et financières
(justificatifs de dépenses, photos non publiées) au-delà des frontières d'église. L'audit les
classe en priorité immédiate, au même rang que le défaut d'isolation déjà corrigé.

## Utilisateurs concernés

- **Porteurs d'un lien de validation partagé** (personnes **sans compte** Koinonia) : leur pouvoir
  doit être strictement borné au périmètre qui leur a été délégué — l'événement ou le projet
  nommé lors de la création du lien, et rien d'autre.
- **Toute personne soumettant une demande de dépense** (tout rôle disposant du droit de soumettre) :
  ne doit pouvoir joindre à sa demande que des pièces qu'elle a elle-même déposées et qui ne sont
  pas déjà rattachées ailleurs.
- **Personnes chargées du suivi comptable** : doivent continuer à consulter les pièces des demandes
  qu'elles traitent, sans restriction nouvelle sur leur travail légitime.
- **Admin / Super Admin** : inchangé, sous réserve du respect de l'isolation par église.
- **Autres rôles (STAR, Ministre, Resp. département, Secrétaire, Reporter, Faiseur de Disciples)** :
  perdent la possibilité de consulter une pièce justificative qui ne les concerne pas — ce qui
  n'était pas un usage prévu.

## Comportement attendu

### Scénario principal

1. Une personne externe reçoit un lien de validation délégué au **projet** « Campagne de rentrée ».
2. Elle ouvre le lien et voit les médias de ce projet. Elle en approuve certains : cela fonctionne.
3. Elle tente de désigner une photo qui ne relève pas de ce projet — une photo d'une autre église,
   dont elle a deviné ou obtenu l'identifiant.
4. **La demande est refusée**, aussi bien pour consulter l'original que pour en changer le statut.
   Le refus est identique à celui opposé pour une photo inexistante : rien n'indique si la photo
   existe ailleurs sur la plateforme.

### Scénarios alternatifs / cas limites

- **Si** le lien de validation est délégué à un **événement**, il ne peut agir que sur les médias
  de cet événement — comportement déjà attendu aujourd'hui, désormais garanti sans condition.
- **Si** le lien est délégué à un **projet**, il ne peut agir que sur les médias de ce projet.
- **Quand** un lien ne porte **aucun** périmètre exploitable, il ne doit accorder **aucune** action
  sur un média : l'absence de périmètre vaut refus, jamais accès total.
- **Quand** une personne soumet une demande de dépense en désignant des pièces justificatives, le
  système n'accepte que celles qu'elle a déposées, encore rattachées à aucune demande, et relevant
  de son église. Si une seule pièce désignée ne remplit pas ces conditions, **la demande entière
  est refusée** — aucun rattachement partiel n'est effectué.
- **Si** une personne consulte une pièce justificative rattachée à la demande d'un tiers, l'accès
  n'est accordé que si elle dispose d'une compétence comptable dans l'église concernée ; sinon il
  est refusé.
- **Quand** une pièce n'est rattachée à aucune demande, seule la personne qui l'a déposée peut la
  consulter ou la supprimer — comportement actuel, conservé.
- **Si** un rattachement incorrect existe déjà en base au moment de la correction, il ne doit pas
  devenir un moyen d'accès : l'église d'une pièce doit rester celle où elle a été déposée, et non
  celle que le rattachement lui a donnée.

## Critères d'acceptation

- [ ] Un lien de validation délégué à un projet **ne peut ni consulter ni modifier** un média qui
      ne relève pas de ce projet, quelle que soit la façon dont il le désigne.
- [ ] Un lien de validation délégué à un événement **ne peut ni consulter ni modifier** un média
      qui ne relève pas de cet événement.
- [ ] Un lien ne portant aucun périmètre exploitable n'accorde **aucune** action sur un média.
- [ ] Aucun chemin d'accès par lien partagé ne permet d'atteindre un média d'une **autre église**
      que celle du périmètre délégué.
- [ ] Le refus opposé à un média hors périmètre est **indiscernable** du refus opposé à un média
      inexistant : aucune information sur l'existence de l'objet ailleurs n'est divulguée.
- [ ] Une demande de dépense désignant une pièce justificative **déposée par quelqu'un d'autre**
      est refusée.
- [ ] Une demande désignant une pièce **déjà rattachée** à une autre demande est refusée.
- [ ] Une demande désignant une pièce relevant d'une **autre église** est refusée.
- [ ] Lorsqu'une pièce désignée est invalide, **aucune** des pièces de la demande n'est rattachée
      et la demande n'est pas créée.
- [ ] La consultation d'une pièce rattachée à la demande d'un tiers exige une **compétence
      comptable** dans l'église concernée ; un rôle quelconque dans l'église ne suffit plus.
- [ ] L'église dont relève une pièce justificative ne peut pas être **modifiée par l'appelant** :
      elle ne dépend pas d'un rattachement que celui-ci peut provoquer.
- [ ] Le dépôt et la consultation de ses **propres** pièces, ainsi que le travail comptable
      légitime, restent inchangés.
- [ ] Des tests automatisés couvrent explicitement : lien projet vs lien événement, média hors
      périmètre, pièce d'autrui, pièce déjà rattachée, et cas inter-églises ; ils échouent si l'un
      de ces défauts réapparaît.

## Hors périmètre

- La refonte du mécanisme de liens partagés (durée de vie, révocation, renouvellement) : seuls
  leur périmètre et son application sont traités ici.
- Les autres constats de l'audit du 2026-08-29 (cookie de session en sous-domaine, cache audio
  immuable, reprise de migration, comptes de déploiement, gate de dépendances…).
- L'ajout d'un antivirus ou d'une inspection de contenu sur les pièces justificatives.
- La modification de la matrice des rôles : aucune permission nouvelle n'est créée, seules les
  compétences existantes sont exigées là où elles manquaient.
- Le nettoyage rétroactif d'éventuels rattachements incorrects déjà présents en base — à traiter
  séparément si l'exploitation du défaut est avérée.

## Questions ouvertes

*Tranchées avec le porteur du projet avant le plan — aucune ne bloque plus.*

- **Consultation d'une pièce rattachée à la demande d'un tiers** → exige la compétence de
  **traitement comptable** (les personnes qui instruisent les demandes). La compétence de
  simple soumission ne suffit pas : un déposant n'a pas à lire les justificatifs des autres.
  Le déposant conserve l'accès à ses propres pièces.
- **Journalisation des tentatives d'accès hors périmètre par lien partagé** → **hors périmètre**
  de cette correction. On corrige le défaut sans ajouter de mécanisme de détection ; les liens
  partagés étant non authentifiés, décider quoi identifier est un sujet à part entière.
