# Spec — Sauvegarde partielle — export et restauration de la configuration

- **Numéro** : 005
- **Statut** : Implémentée
- **Créée le** : 2026-07-04
- **Branche suggérée** : `feat/sauvegarde-partielle`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Le module de sauvegarde existant produit un dump SQL complet de toute la base. La restauration
remplace intégralement la base de données — toutes les données récentes sont perdues.

Ce mode est adapté à la reprise après sinistre total, mais pas aux cas fréquents suivants :
- On a malencontreusement supprimé des ministères ou des départements et on veut les retrouver
  sans effacer les plannings, comptes-rendus ou demandes des dernières semaines.
- On maintient un environnement de recette et on veut y injecter la structure de prod
  (églises, ministères, départements, membres) sans réécrire les données opérationnelles.
- Après une migration entre serveurs, on veut vérifier et réimporter sélectivement
  la configuration d'origine si certaines entités sont manquantes.

La solution : pouvoir exporter les données de **configuration structurelle** d'une ou plusieurs
églises dans un fichier autonome, et les réimporter dans n'importe quelle instance
avec contrôle sur ce qui est écrasé, fusionné ou ignoré.

## Utilisateurs concernés

- **Super Admin** : seul rôle autorisé à exporter et importer la configuration. Accès à toutes
  les églises. Peut déclencher un export ciblé sur une église précise ou sur l'ensemble.
- Les autres rôles (Admin inclus) ne sont pas concernés.

## Périmètre des données exportées

L'export couvre les **données de configuration structurelle** :

- Définition des églises (nom, slug, fuseau horaire, paramètres)
- Ministères et leurs rattachements à une église
- Départements et leurs rattachements à un ministère
- Membres (fiches STAR : nom, prénom, email, téléphone, département(s), fonctions)
- Liens membres-utilisateurs (qui a lié son compte à quelle fiche — sans les comptes utilisateurs eux-mêmes)
- Rôles des utilisateurs dans chaque église

L'export **ne couvre pas** les données opérationnelles (voir Hors périmètre).

## Comportement attendu

### Scénario principal — export

1. Le Super Admin ouvre la section Administration > Sauvegardes.
2. Il clique sur « Exporter la configuration ».
3. Il choisit le périmètre : une église précise ou toutes les églises.
4. Il choisit les catégories à inclure (cases à cocher) :
   - Structure (églises, ministères, départements)
   - Membres
   - Liens membres-utilisateurs et rôles
5. Il déclenche l'export. L'application génère un fichier JSON téléchargeable.
6. Le fichier contient : les données sélectionnées + métadonnées (date, version de l'app,
   empreinte de l'instance source).

### Scénario principal — import/restauration partielle

1. Le Super Admin ouvre Administration > Sauvegardes.
2. Il clique sur « Importer une configuration ».
3. Il sélectionne un fichier JSON exporté précédemment (depuis la même instance ou une autre).
4. L'application analyse le fichier et affiche un résumé de ce qu'il contient
   (N églises, N ministères, N départements, N membres).
5. Il choisit la stratégie de fusion (unique, appliquée à toutes les catégories) :
   - **Ignorer les doublons** : si une entité avec le même identifiant existe déjà, on la laisse intacte.
   - **Mettre à jour les doublons** : si elle existe, on écrase ses champs avec les valeurs du fichier.
   - **Tout remplacer** : on supprime les entités existantes des catégories sélectionnées pour cette église, puis on importe depuis le fichier.
6. Il confirme. L'application importe les données et affiche un rapport :
   - N entités créées, N mises à jour, N ignorées, N erreurs.

### Scénarios alternatifs / cas limites

- **Fichier invalide ou corrompu** : le système refuse l'import et affiche un message d'erreur clair
  avant toute modification de la base.
- **Version incompatible** : si le fichier provient d'une version de l'application dont le schéma
  est trop ancien, le système avertit et peut refuser l'import ou signaler les champs non reconnus.
- **Église inconnue dans le fichier** : si le fichier contient une église dont le slug n'existe pas
  dans l'instance cible, le système propose de la créer ou de l'ignorer.
- **Import partiel en erreur** : si une erreur survient en cours d'import, les entités déjà importées
  lors de cette session sont annulées (comportement transactionnel).
- **Membres sans département** : un membre dont le département référencé n'existe pas dans la cible
  est importé sans affectation (ou signalé dans le rapport).

## Critères d'acceptation

- [ ] Le Super Admin peut exporter un fichier JSON de la configuration d'une église (structure + membres)
- [ ] Le fichier exporté est autonome et contient toutes les métadonnées nécessaires à la réimportation
- [ ] Le Super Admin peut importer un fichier JSON exporté et voir un résumé avant de confirmer
- [ ] L'import peut se faire avec la stratégie "ignorer les doublons" sans modifier les entités existantes
- [ ] L'import peut se faire avec la stratégie "mettre à jour les doublons"
- [ ] Un fichier invalide (non-JSON, schéma incorrect) est rejeté avant toute modification
- [ ] Un import interrompu par une erreur n'laisse pas la base dans un état partiellement modifié
- [ ] Le rapport post-import indique le nombre d'entités créées, mises à jour, ignorées et en erreur
- [ ] L'export et l'import sont réservés au Super Admin (403 pour tout autre rôle)
- [ ] L'opération est journalisée dans les logs d'audit (qui, quand, périmètre, résultat)

## Hors périmètre

- Plannings (affectations de service)
- Événements et comptes-rendus
- Demandes (secrétariat, média, communication)
- Données comptables
- Données de discipolat
- Données agenda / rendez-vous
- Notifications et abonnements
- Photos et fichiers médias
- Sauvegardes SQL complètes (fonctionnalité déjà existante, non modifiée)
- Export incrémental ou différentiel automatique
- Synchronisation temps-réel entre instances

## Questions ouvertes

Aucune — toutes les questions ont été tranchées :
- Export/import réservé au Super Admin uniquement
- Fichier téléchargeable à la demande, non stocké sur S3
- Fiches membres et liaisons incluses, comptes utilisateurs (Google) exclus
- Les trois stratégies de fusion disponibles en V1 (ignorer / mettre à jour / tout remplacer)
