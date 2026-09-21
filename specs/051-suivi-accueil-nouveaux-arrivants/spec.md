# Spec — Suivi de l'accueil des nouveaux arrivants (consentement, statuts d'attente, relances)

- **Numéro** : 051
- **Statut** : Brouillon
- **Créée le** : 2026-09-21
- **Branche suggérée** : `feat/suivi-accueil-nouveaux-arrivants`
- **Issue source** : [#579](https://github.com/iccbretagne/koinonia/issues/579)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Aujourd'hui, un nouvel arrivant à l'accueil peut remplir un formulaire s'il souhaite être
contacté (pour rejoindre une famille d'impact ou en savoir plus sur l'église). Une fois le
formulaire soumis, la personne suit un parcours de suivi jusqu'à son rattachement à une famille.

Ce parcours ne couvre que le cas où la personne veut être contactée **immédiatement** et où
son adresse permet de l'affecter directement à une famille. Deux situations réelles, rencontrées
régulièrement à l'accueil, n'ont aujourd'hui aucune réponse dans l'outil :

1. Une personne ne souhaite **pas** être contactée dans l'immédiat, mais accepte que son contact
   soit conservé pour être recontactée plus tard. Rien ne distingue aujourd'hui ce cas d'un refus
   pur et simple de contact (pour lequel, à l'inverse, aucune information n'est collectée — et
   c'est très bien ainsi).
2. Une personne souhaite rejoindre une famille, mais son adresse ne correspond à aucune famille
   d'impact existante. La décision sur la marche à suivre revient normalement au département en
   charge de la mission, mais ce dernier n'a aujourd'hui aucune visibilité sur ces demandes.

Par ailleurs, une fois qu'une demande est mise en attente (que ce soit pour être recontactée plus
tard, ou en attente d'une décision externe), rien ne signale qu'elle traîne : l'équipe en charge
de l'intégration n'est jamais alertée qu'une personne attend une réponse depuis trop longtemps,
et personne n'est incité à relancer qui que ce soit.

Sans cette évolution, des personnes intéressées par l'église restent silencieusement sans suite,
et les cas qui sortent du parcours standard (adresse hors zone, demande de rappel différé) sont
soit perdus, soit gérés en dehors de l'outil.

## Utilisateurs concernés

- **STAR** (membre de l'équipe en charge de l'accueil/intégration) : recueille le formulaire à
  l'accueil, traite au quotidien les demandes en cours, reçoit les relances à traiter.
- **Resp. département** (responsable de l'équipe intégration) : suit l'ensemble des demandes de
  son équipe, y compris celles en attente, et peut être sollicité pour les relances.
- **Ministre** (du ministère dont dépend l'intégration) : a une vue d'ensemble du parcours des
  nouveaux arrivants de son ministère.
- **Admin / Super Admin** : configure le délai avant relance (voir Questions ouvertes) et a accès
  à l'ensemble des demandes, quel que soit leur statut.

## Comportement attendu

### Scénario principal

1. À l'accueil, un nouvel arrivant est invité à remplir un formulaire s'il est intéressé — soit
   pour être contacté maintenant, soit pour être recontacté plus tard.
2. Si la personne ne souhaite aucun contact, elle ne remplit pas le formulaire : aucune
   information n'est collectée, rien ne se passe côté suivi.
3. Si la personne souhaite être contactée maintenant et que son adresse correspond à une famille
   d'impact existante, la demande suit le parcours actuel : rattachement à une famille, prise de
   contact, intégration.
4. Si la personne souhaite être contactée maintenant mais que son adresse ne correspond à aucune
   famille d'impact connue, la demande est mise en attente d'une décision du département en
   charge de la mission, et cette mise en attente est visible par l'équipe intégration.
5. Si la personne préfère être recontactée plus tard plutôt que maintenant, sa demande est mise
   de côté (son contact est conservé) sans lui affecter de famille dans l'immédiat.
6. Dès qu'une demande reste en attente (cas 4 ou 5) au-delà d'un délai défini, l'équipe intégration
   est alertée qu'il est temps de relancer.

### Scénarios alternatifs / cas limites

- **Si** une personne coche « me recontacter plus tard » puis change d'avis et prend l'initiative
  de contacter l'église elle-même avant l'échéance de relance, l'équipe doit pouvoir faire évoluer
  sa demande vers le parcours standard (contact immédiat) sans perdre l'historique de sa demande.
- **Si** le département en charge de la mission tranche le cas d'une adresse hors zone (par
  exemple : rattacher malgré tout à une famille proche, ou traiter au cas par cas), l'équipe
  intégration doit pouvoir refléter cette décision dans le suivi de la demande.
- **Quand** une demande est en attente d'une décision du département en charge de la mission
  au-delà du délai défini, l'équipe intégration est alertée pour relancer ce département — la
  relance vise le département, pas la personne.
- **Quand** une demande est en attente parce que la personne souhaite être recontactée plus tard
  au-delà du délai défini, l'équipe intégration est alertée pour relancer **la personne**.
- **Si** une demande en attente est traitée (rattachée à une famille, abandonnée, etc.) avant
  l'échéance de relance, aucune alerte ne doit être déclenchée pour cette demande.

## Critères d'acceptation

- [ ] Le formulaire d'accueil permet à la personne d'indiquer si elle souhaite être contactée
      maintenant, ou être recontactée plus tard — en plus du cas où elle ne remplit rien.
- [ ] Une demande dont la personne souhaite être recontactée plus tard est visible dans le suivi
      de l'équipe intégration comme distincte des demandes en cours de rattachement à une famille.
- [ ] Une demande dont l'adresse ne correspond à aucune famille d'impact connue est visible dans
      le suivi comme distincte des demandes déjà rattachées à une famille, avec une mention
      explicite qu'elle attend une décision du département en charge de la mission.
- [ ] L'équipe intégration peut voir, en un coup d'œil, l'ensemble des demandes actuellement en
      attente (recontact différé ou décision du département mission), quel que soit leur âge.
- [ ] Passé un délai défini, une demande en attente déclenche une alerte visible par l'équipe
      intégration, précisant qui doit être relancé (la personne, ou le département mission).
- [ ] Une demande qui sort de l'attente (traitée, rattachée, abandonnée) avant l'échéance
      n'affiche plus aucune alerte de relance.
- [ ] Une personne qui ne remplit pas le formulaire à l'accueil ne génère aucune trace ni demande
      de suivi.

## Hors périmètre

- L'intégration du département en charge de la mission comme acteur à part entière de Koinonia
  (rôle dédié, notifications qui lui sont propres, file de traitement qui lui appartient) —
  cette spec se limite à rendre visible, côté équipe intégration, qu'une demande attend son
  retour. Faire du département mission un acteur autonome de l'outil est une évolution
  potentielle ultérieure, pas couverte ici.
- Toute modification du parcours une fois qu'une personne est rattachée à une famille
  (accompagnement, vie de la famille d'impact, etc.) — hors périmètre, non affecté par cette spec.
- Le suivi des nouveaux convertis (appel au salut, accompagnement MSDP) et le workflow de
  rendez-vous pastoral qui lui est lié — traités séparément dans l'issue
  [#580](https://github.com/iccbretagne/koinonia/issues/580).
- Toute automatisation qui déclencherait une action à la place d'un humain (relance automatique
  envoyée à la personne, décision automatique sur un cas d'adresse hors zone…) — cette spec ne
  fait qu'alerter une personne de l'équipe, jamais agir à sa place.

## Questions ouvertes

- [À CLARIFIER: le délai avant relance est-il unique pour tous les cas d'attente, ou distinct
  entre « personne à recontacter plus tard » et « en attente du département mission » ? Le
  contexte de l'issue propose un ordre de grandeur de 1 à 3 mois, sans trancher.]
- [À CLARIFIER: qui doit pouvoir régler ce délai — uniquement un administrateur, ou aussi le
  responsable de l'équipe intégration lui-même ? L'issue source suggère que ce devrait être
  paramétrable par le responsable de l'intégration, sans que ce soit acté.]
- [À CLARIFIER: quand une demande est en attente du département mission depuis trop longtemps,
  qui exactement doit recevoir l'alerte de relance — toute l'équipe intégration, ou seulement
  son responsable ?]
- [À CLARIFIER: une fois qu'une décision du département mission est connue (par un canal externe
  à Koinonia, puisque ce département n'est pas encore utilisateur de l'outil), qui est responsable
  de la saisir dans Koinonia — l'équipe intégration elle-même, sur simple information reçue ?]
