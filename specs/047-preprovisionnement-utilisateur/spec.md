# Spec — Pré-provisionnement d'un utilisateur par e-mail

- **Numéro** : 047
- **Statut** : Implémentée
- **Créée le** : 2026-09-13
- **Branche suggérée** : `feat/preprovisionnement-utilisateur`
- **Issue** : #552

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Un Admin / Super Admin qui connaît l'adresse e-mail d'un futur STAR ne peut aujourd'hui rien
préparer avant que cette personne se connecte elle-même une première fois avec son compte
Google : le rattachement à une fiche STAR est un geste qui suit la première connexion, jamais
qui la précède.

En pratique, une bonne partie du mécanisme existe déjà (spec 037, rattachement inter-églises) :
un compte peut être créé par une adresse e-mail seule et lié immédiatement à une fiche STAR,
sans attendre que la personne se soit jamais connectée. Mais ce chemin est **caché** dans l'écran
de rattachement d'un membre à un compte, pensé pour retrouver un compte déjà connu — pas comme un
geste volontaire de préparation. Et une fois ce compte créé, rien ne le distingue plus d'un compte
actif : impossible de savoir, en le consultant plus tard, qu'il n'a encore jamais été utilisé
par la personne réelle. Si l'e-mail saisi est erroné, ou si la personne se connecte un jour avec
une autre adresse Google que celle attendue, personne n'est prévenu — le compte préparé reste
silencieusement orphelin.

Le problème n'est donc pas « rendre possible » (déjà le cas), mais rendre le geste **visible,
volontaire et suivi** : un point d'entrée clair pour préparer un compte, une manière de savoir
qu'il attend encore sa première connexion, et une réponse au cas où cette connexion ne vient
jamais — ou vient avec la mauvaise adresse.

## Utilisateurs concernés

- **Super Admin / Admin** : préparent un compte pour un futur STAR en connaissant son adresse
  e-mail, avant sa première connexion. Peuvent voir quels comptes attendent encore leur première
  connexion et les corriger ou les retirer.
- **Secrétaire** : selon le périmètre déjà accordé sur la gestion des membres — à confirmer avec
  la matrice de permissions existante (`members:manage`), pas d'élargissement de permission prévu
  par cette feature.
- **STAR pré-provisionné** : la personne elle-même — dès sa première connexion avec l'adresse
  attendue, elle retrouve directement son accès et sa fiche, sans étape supplémentaire de son côté.

## Comportement attendu

### Scénario principal

1. Un Admin sait qu'un nouveau STAR va rejoindre un département, et connaît son adresse e-mail
   Google (avant que cette personne ne se connecte jamais à Koinonia).
2. Depuis un nouvel écran « Créer un utilisateur », dédié et découvrable (distinct de l'écran de
   rattachement pensé pour retrouver un compte déjà connu), l'Admin saisit cette adresse et la
   relie à la fiche STAR concernée — ou crée la fiche STAR dans le même geste si elle n'existe pas
   encore.
3. Le compte est créé immédiatement, lié à la fiche, avec l'accès STAR de base — comme si la
   personne s'était déjà connectée.
4. Dans les écrans de gestion des utilisateurs et des accès, ce compte est visiblement marqué
   comme n'ayant jamais été utilisé, tant que la personne ne s'est pas encore connectée.
5. La personne se connecte pour la première fois avec son compte Google, en utilisant l'adresse
   exacte saisie par l'Admin : elle arrive directement dans son espace, avec ses accès déjà en
   place. Le marquage « jamais connecté » disparaît dès cette première connexion.

### Scénarios alternatifs / cas limites

- **Adresse déjà utilisée par un compte existant** : le geste de préparation retrouve ce compte
  et propose de le lier à la fiche STAR, plutôt que d'en créer un second (comportement actuel de
  spec 037, inchangé).
- **La personne se connecte avec une autre adresse que celle saisie par l'Admin** : NextAuth crée
  alors un compte Google distinct, sans lien avec le compte préparé — celui-ci reste orphelin, visible
  comme « jamais connecté ». Aucune détection ni alerte active : l'Admin s'en aperçoit en consultant
  les écrans de gestion des utilisateurs, puis corrige manuellement (retire l'ancien, prépare ou lie
  le bon compte).
- **Un compte préparé n'est jamais activé** : aucune purge automatique. Le compte reste en l'état
  indéfiniment tant qu'un Admin ne le retire pas explicitement (cf. critère d'acceptation sur le
  retrait).
- **L'Admin retire un compte préparé jamais activé** : la fiche STAR redevient disponible pour un
  nouveau rattachement (par ce même geste ou par la voie existante), sans laisser de trace bloquante.
- **Une fiche STAR a déjà un compte lié** (préparé ou actif) : le geste de préparation refuse de
  créer un second lien, avec le même message d'erreur qu'aujourd'hui (« Ce STAR est déjà lié à un
  compte dans cette église »).
- **Église mono-STAR sans changement** : une église qui n'utilise jamais ce geste ne voit aucun
  changement dans les écrans existants — le marquage « jamais connecté » n'apparaît que pour les
  comptes concernés.

## Critères d'acceptation

- [x] Un nouvel écran « Créer un utilisateur » permet de préparer un compte par e-mail, lié à une
      fiche STAR existante ou nouvellement créée, sans attendre une première connexion.
- [x] Le compte préparé dispose immédiatement de l'accès STAR de base, identique à ce qu'obtient
      aujourd'hui un rattachement classique.
- [x] Tant qu'aucune connexion n'a eu lieu, le compte est visiblement distingué comme « jamais
      connecté » dans l'écran de gestion des utilisateurs (`/admin/users`). Décision prise en fin
      d'implémentation (2026-09-13) : l'écran de gestion des accès (`/admin/access`), centré sur
      les rôles plutôt que sur le statut du compte, reste hors périmètre — à étendre plus tard si
      le besoin se confirme.
- [x] Dès la première connexion réussie avec l'adresse exacte préparée, le marquage disparaît et
      la personne accède directement à ses écrans et données, sans étape supplémentaire.
- [x] Une adresse déjà associée à un compte existant réutilise ce compte plutôt que d'en créer un
      second, avec le même contrôle de doublon qu'aujourd'hui (un compte ↔ un STAR par église).
- [x] Une fiche STAR déjà liée à un compte ne peut pas être reliée une seconde fois par ce geste.
- [x] Un Admin peut retirer un compte préparé jamais activé, libérant la fiche STAR pour un
      nouveau rattachement.
- [x] Une église qui n'utilise jamais cette fonctionnalité ne constate aucun changement visible
      dans les écrans existants (utilisateurs, accès, rattachement).

## Hors périmètre

- Modifier le comportement de connexion Google ou la stratégie de session NextAuth.
- Élargir les permissions d'un rôle existant (le geste reste protégé par `members:manage`, comme
  le rattachement actuel).
- Envoyer un e-mail d'invitation ou de notification à la personne pré-provisionnée (hors
  périmètre sauf demande explicite — Koinonia n'a pas aujourd'hui de canal d'e-mail sortant vers
  les utilisateurs finaux).
- Pré-provisionner en masse (import de liste d'e-mails) — un seul compte à la fois.
- Le rattachement d'un compte déjà actif à une seconde église (couvert par spec 037, inchangé).

## Questions ouvertes

Tranchées le 2026-09-13 :

- **Adresse divergente à la connexion** : marquage passif seulement, pas de détection/alerte active.
- **Purge** : suppression manuelle uniquement par l'Admin, pas de purge automatique.
- **Point d'entrée** : nouvel écran dédié « Créer un utilisateur », distinct du rattachement existant.
