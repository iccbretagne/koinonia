# Spec — Reprise fiable de la migration des cultes Audiobookshelf après un échec partiel

- **Numéro** : 028
- **Statut** : Implémentée
- **Créée le** : 2026-08-29
- **Branche suggérée** : `feat/journal-migration-audiobookshelf`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Lors d'une migration ponctuelle des cultes depuis l'ancien système Audiobookshelf, un opérateur
lance un outil de migration qui traite les cultes un par un. Pour chaque culte traité avec
succès, l'outil retient qu'il a été importé, afin qu'une éventuelle relance ne le réimporte pas
en double.

Aujourd'hui, si le traitement d'un culte échoue **après** que des données aient déjà été créées
côté Koinonia mais **avant** que l'outil n'ait fini d'enregistrer que ce culte est traité, deux
problèmes surviennent au moment où l'opérateur corrige le problème et relance l'outil :

1. **Le culte est réimporté en double** : l'outil ne sait pas qu'une tentative précédente a déjà
   créé des données pour ce culte, puisque rien n'a été retenu à son sujet. Le culte se retrouve
   donc importé deux fois.
2. **Le nettoyage de la tentative ratée est impossible via l'outil lui-même** : l'outil propose une
   commande pour annuler l'import d'un culte, mais cette commande ne fonctionne que si l'outil a
   gardé une trace de ce culte — ce qui n'est justement pas le cas pour une tentative qui a échoué
   avant la fin. L'opérateur se retrouve face à des données orphelines qu'il ne peut nettoyer
   qu'en intervenant manuellement, en dehors de l'outil prévu à cet effet.

L'outil affiche lui-même, au moment de l'échec, un message suggérant d'utiliser la commande de
nettoyage puis de relancer — un conseil qui ne fonctionne pas dans cette situation précise et
induit l'opérateur en erreur.

**Pourquoi maintenant** : cette migration est un outil ponctuel destiné à être exécuté en
production, contre des données réelles de culte, potentiellement pour plusieurs eglises. Un échec
partiel n'est pas hypothétique (dépendance à un service externe pendant l'upload) et sa
conséquence — doublons en base, données orphelines non nettoyables par l'outil — nécessite
aujourd'hui une intervention manuelle en base de données à chaque incident, sans garde-fou.

## Utilisateurs concernés

- **Super Admin / Admin** — seuls profils habilités à exécuter cet outil de migration (accès
  direct à l'environnement serveur et à la base de données, hors de l'application web). Aucun
  autre rôle n'est concerné : l'outil n'est pas exposé dans l'application, c'est un outil
  opérationnel réservé à l'équipe technique lors d'une migration ponctuelle.

## Comportement attendu

### Scénario principal

1. Un opérateur lance l'outil de migration sur un ensemble de cultes.
2. Chaque culte est traité l'un après l'autre ; l'outil retient, dès le tout début du traitement
   d'un culte (avant toute création de donnée), qu'une tentative est en cours pour ce culte.
3. Un culte dont le traitement se termine avec succès est marqué comme définitivement importé.
4. Un culte dont le traitement échoue à n'importe quelle étape reste marqué comme "tentative
   inaboutie" — ni traité comme importé avec succès, ni oublié.
5. L'opérateur corrige la cause de l'échec (ex. rétablissement d'un service externe) puis relance
   l'outil sur le même ensemble de cultes.
6. Les cultes déjà importés avec succès sont ignorés (pas de doublon).
7. Pour le ou les cultes en tentative inaboutie, l'outil de nettoyage retrouve et supprime
   correctement toutes les données déjà créées par la tentative précédente, sans intervention
   manuelle en base.
8. L'opérateur relance ensuite l'import normal : le culte nettoyé est traité comme neuf et importé
   avec succès.

### Scénarios alternatifs / cas limites

- **Si l'échec survient avant toute création de donnée** (ex. erreur de lecture du dossier source
  avant le moindre appel externe) alors il n'y a rien à nettoyer — le culte doit simplement être
  retenté normalement à la prochaine exécution, sans laisser de trace inutile.
- **Si un opérateur relance l'outil sans avoir d'abord nettoyé une tentative inaboutie**, l'outil
  ne doit ni créer de doublon, ni échouer silencieusement — il doit signaler clairement à
  l'opérateur qu'une tentative précédente existe pour ce culte et nécessite un nettoyage avant
  réimport.
- **Si l'outil a déjà été exécuté par le passé** (avant cette évolution) et a laissé une trace
  d'anciens cultes importés avec succès, ces traces doivent continuer à être reconnues comme
  "déjà importé" sans qu'aucune action de l'opérateur ne soit nécessaire pour les faire migrer
  vers le nouveau comportement.
- **Quand l'opérateur demande le nettoyage d'un culte qui n'a en réalité aucune tentative connue**
  (ni réussie, ni inaboutie), l'outil doit l'indiquer clairement plutôt que d'échouer de façon
  confuse.

## Critères d'acceptation

- [x] Un échec survenant après la création de données pour un culte, mais avant la fin de son
      traitement, n'entraîne jamais la création d'un doublon lors d'une relance ultérieure de
      l'import normal (avant tout nettoyage).
- [x] Un échec de ce type produit une tentative que l'outil de nettoyage peut retrouver et
      supprimer intégralement, sans intervention manuelle en base de données.
- [x] Une fois une tentative inaboutie nettoyée, le culte correspondant peut être réimporté
      normalement et aboutit à un import unique et complet.
- [x] Les cultes importés avec succès lors d'exécutions passées de l'outil (avant cette évolution)
      restent reconnus comme "déjà importés" sans action requise de l'opérateur.
- [x] Un culte pour lequel aucune donnée n'a été créée avant l'échec ne laisse aucune trace
      empêchant sa reprise normale.
- [x] Le message affiché par l'outil en cas d'échec reflète fidèlement la procédure de reprise
      réellement disponible (n'oriente plus l'opérateur vers une commande de nettoyage qui ne
      fonctionne pas dans son cas).

## Hors périmètre

- Toute évolution de l'outil au-delà de la fiabilité de la reprise après échec (nouveaux formats
  source, nouvelles options de filtrage, parallélisation des imports, etc.).
- Rendre l'outil utilisable par un rôle autre que l'équipe technique / Super Admin — il reste un
  outil opérationnel hors de l'application web, pas une fonctionnalité exposée aux utilisateurs
  de Koinonia.
- Garantir une reprise automatique sans intervention de l'opérateur (l'objectif est de rendre le
  nettoyage possible et fiable via l'outil, pas de le déclencher automatiquement).
- Tout mécanisme de verrouillage empêchant deux exécutions simultanées de l'outil — l'usage reste
  un opérateur unique exécutant l'outil de façon séquentielle, comme aujourd'hui.

## Questions ouvertes

- Aucune — le comportement attendu ci-dessus couvre le cas rapporté ; pas de point bloquant
  identifié pour la planification technique.
