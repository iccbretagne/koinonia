# Spec — Relance d'inactivité pour les suivis MSDP bloqués

- **Numéro** : 018
- **Statut** : Implémentée
- **Créée le** : 2026-08-23
- **Branche suggérée** : `feat/relance-inactivite-msdp`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Contexte & problème

Le suivi MSDP accompagne un nouveau converti après son appel au salut : un
conseiller lui est assigné, un premier contact est établi, puis la personne
est intégrée à la formation des nouveaux convertis, jusqu'à la fin du suivi.

Aujourd'hui, un suivi peut rester bloqué indéfiniment à une étape
intermédiaire (conseiller assigné mais qui n'a jamais pris contact, contact
établi mais formation jamais démarrée, etc.) sans qu'aucune alerte ne soit
émise. Personne — ni le conseiller concerné, ni l'équipe qui supervise le
parcours d'intégration — n'est prévenu qu'un accompagnement est à l'arrêt.
Une relance équivalente existe déjà pour les demandes d'intégration en
famille, mais rien de comparable ne couvre le suivi MSDP, alors qu'il s'agit
de l'étape la plus sensible du parcours (accompagnement spirituel d'une
personne récemment convertie).

## Utilisateurs concernés

- **Conseiller MSDP** *(rôle fonctionnel, rattaché à un département dont la
  fonction est le suivi MSDP — pas un rôle Koinonia global)* : reçoit une
  alerte quand un suivi qui lui est assigné est resté inactif trop longtemps.
- **Équipe intégration / MSDP** *(membres du département en charge du
  parcours d'intégration ou du suivi MSDP)* : reçoit une alerte quand un
  suivi inactif **n'a pas de conseiller assigné**, faute d'un destinataire
  individuel plus pertinent.
- **Super Admin** : peut voir ces alertes comme tout membre de l'équipe
  concernée, sans traitement particulier.

## Comportement attendu

### Scénario principal

1. Un suivi MSDP est à une étape intermédiaire (conseiller assigné, premier
   contact établi, ou en cours de formation — mais pas encore terminé ni
   abandonné) depuis plus de N jours sans aucune évolution.
2. Le système détecte cette inactivité lors de son cycle de vérification
   périodique.
3. Le conseiller assigné au suivi reçoit une notification l'informant que ce
   suivi est resté sans mise à jour, avec le nom de la personne suivie, le
   temps écoulé, et un lien direct vers le suivi.
4. Si aucun conseiller n'est assigné, l'alerte est envoyée à l'équipe qui gère
   le parcours d'intégration/MSDP à la place.
5. La même relance ne doit pas être répétée à chaque vérification tant que le
   suivi reste inactif — un intervalle minimal doit s'écouler entre deux
   alertes pour un même suivi.

### Scénarios alternatifs / cas limites

- **Si** le suivi a évolué (nouveau statut, note ajoutée, changement quelconque)
  entre-temps, alors **le compteur d'inactivité repart de zéro** — pas
  d'alerte tant que le nouveau délai n'est pas écoulé.
- **Si** le suivi est terminé ou abandonné, alors **aucune alerte n'est jamais
  émise**, quel que soit le temps écoulé depuis sa dernière mise à jour.
- **Quand** un suivi vient d'être créé (premier statut, personne pas encore
  prise en charge) et dépasse le délai sans qu'un conseiller lui soit assigné,
  le système doit alerter l'équipe intégration/MSDP — pas de destinataire
  individuel possible dans ce cas.
- **Si** l'envoi d'une alerte échoue techniquement (email indisponible, etc.),
  cela ne doit **pas** interrompre le traitement des autres suivis inactifs
  détectés dans le même cycle.

## Critères d'acceptation

- [x] Un suivi MSDP non terminal (ni terminé, ni abandonné) sans mise à jour
      depuis N jours déclenche une alerte lors du prochain cycle de
      vérification.
- [x] L'alerte est adressée au conseiller assigné quand il y en a un, sinon à
      l'équipe intégration/MSDP.
- [x] L'alerte identifie clairement la personne suivie, depuis combien de
      temps le suivi est inactif, et permet d'accéder directement au suivi
      concerné.
- [x] Un même suivi inactif ne génère pas de nouvelle alerte tant que
      l'intervalle minimal entre deux relances n'est pas écoulé.
- [x] Un suivi terminé ou abandonné n'est jamais concerné par cette relance.
- [x] Une mise à jour du suivi réinitialise le délai avant la prochaine alerte
      possible.
- [x] Le mécanisme s'exécute automatiquement, sans action manuelle requise,
      selon le même rythme que les autres vérifications périodiques déjà en
      place dans l'application.
- [x] L'échec d'envoi d'une alerte pour un suivi n'empêche pas le traitement
      des autres suivis inactifs du même cycle.

## Hors périmètre

- Modifier les règles ou les transitions de statut du suivi MSDP lui-même.
- Ajouter une relance pour les statuts terminaux (terminé, abandonné).
- Permettre à un utilisateur de déclencher une relance manuellement en dehors
  du cycle automatique.
- Changer le délai ou l'intervalle de relance existant pour les demandes
  d'intégration familiale (mécanisme équivalent déjà en place, non concerné
  par cette feature).

## Questions ouvertes

*Aucune — tranchées avec l'utilisateur avant passage au plan :*

- Délai d'inactivité : identique à celui des demandes d'intégration familiale
  (7 jours), pas de paramètre distinct pour le suivi MSDP.
- Le message d'alerte varie selon le statut du suivi (ex. "conseiller assigné
  sans contact établi" vs "en formation depuis longtemps"), sur le même
  principe que les demandes d'intégration familiale — plus actionnable pour
  le destinataire qu'un message générique.
