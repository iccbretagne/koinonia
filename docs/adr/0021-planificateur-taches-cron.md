# ADR-0021 — Un seul déclencheur cron, chaque tâche à son propre rythme

- **Statut** : Accepté
- **Date** : 2026-10-03

## Contexte

Les tâches planifiées passent par `POST /api/cron`, appelé **toutes les heures** par un minuteur
systemd. Cette route lançait **toutes** ses tâches en parallèle à chaque appel. Chacune gérait
son propre rythme, de façon disparate :
- les rappels de service étaient protégés par `Church.reminderLastSentAt` ;
- la collecte des disponibilités était protégée par des horodatages ;
- l'intégration et le suivi pastoral évitaient les doublons en relisant les notifications déjà
  envoyées ;
- le récapitulatif secrétariat partait **à chaque appel** dès qu'il y avait eu des changements.

La spec 060 (notifications regroupées des changements de planning) a besoin d'une tâche qui
tourne **toutes les 5 minutes**. Accélérer le minuteur aurait multiplié par douze les emails du
récapitulatif secrétariat et refait inutilement les requêtes des autres tâches. Ajouter un second
minuteur dédié aurait demandé une installation de plus par serveur, sans rien mutualiser pour la
tâche suivante.

## Décision

On garde **un seul déclencheur externe**, appelé **toutes les 5 minutes**, et un **planificateur
interne** (`src/lib/cron-scheduler.ts`) :

- **Rythme déclaré par tâche.** Chaque tâche de `POST /api/cron` déclare une clé et un rythme :
  - `every-run` : à chaque appel ;
  - `interval` : au plus une fois par intervalle, avec une tolérance de 2 minutes pour absorber
    l'imprécision du déclencheur ;
  - `daily` : une fois par jour, à partir d'une heure donnée, heure du serveur.
- **État conservé en base.** La table `cron_task_runs` (une ligne par tâche) garde le début et la
  fin du dernier passage, sa durée, la dernière erreur et un verrou. Seules les tâches **dues**
  s'exécutent.
- **Prise de main atomique.** Une mise à jour conditionnelle exige le `lastStartedAt` lu (jeton de
  concurrence) et un verrou libre ou échu. Deux appels qui se chevauchent ne lancent jamais deux
  fois la même tâche. Le verrou échoit au bout de 15 minutes par défaut, pour qu'un process tué ne
  bloque pas une tâche indéfiniment.
- **Échecs isolés.** L'échec d'une tâche est consigné (`lastError`, journal) sans empêcher les
  autres ni faire échouer l'appel.
- **Modules désactivés.** Une tâche d'un module désactivé n'est pas déclarée : elle ne crée aucune
  ligne de suivi (spec 038).
- **Sauvegarde à part.** La sauvegarde de la base reste sur son propre minuteur (2 h) : elle est
  longue et bloquerait les passages de 5 minutes.

Toute nouvelle tâche planifiée s'ajoute à la liste du planificateur avec son rythme. On ne crée
plus de route ni de minuteur cron dédiés.

## Alternatives considérées

- **Accélérer `/api/cron` sans planificateur.** *Écartée :* le récapitulatif secrétariat serait
  parti toutes les 5 minutes, et chaque tâche aurait refait ses requêtes à chaque appel.
- **Une route et un minuteur dédiés par besoin de fréquence.** *Écartée :* une installation de
  plus par serveur à chaque nouveau rythme, et rien de mutualisé.
- **Minuterie en mémoire du process Next.js** (`setInterval`, `setTimeout`). *Écartée :* perdue
  au redémarrage, dupliquée s'il y a plusieurs process, et sans trace.
- **Déléguer au worker audio**, qui tourne déjà en boucle. *Écartée :* ce process appartient au
  module audio (frontières), et une instance peut ne pas l'exécuter.
- **Bibliothèque de file de tâches (Redis, BullMQ…).** *Écartée :* une infrastructure de plus pour
  une poignée de tâches légères ; la base existante suffit.

## Conséquences

- Les rythmes vivent dans le code et se testent. Le serveur ne fixe que la fréquence du
  déclencheur.
- Une tâche non due ne coûte qu'une lecture de `cron_task_runs`. Le coût d'un appel toutes les
  5 minutes reste donc négligeable.
- **Action serveur** : chaque environnement doit passer `koinonia-cron.timer` de `hourly` à
  `*:0/5`. Tant que ce n'est pas fait, le comportement reste celui d'avant, au rythme horaire.
- La précision d'une tâche dépend de la fréquence du déclencheur : au mieux 5 minutes. Un besoin
  plus fin demanderait un autre mécanisme.
- Diagnostic : `SELECT * FROM cron_task_runs` montre le dernier passage et la dernière erreur de
  chaque tâche.
- La route doublon `/api/cron/reminders`, qu'aucun minuteur n'appelait, est supprimée.

## Références

- Spec 060 — `specs/060-notifications-regroupees-planning/` (premier besoin à 5 minutes)
- Spec 038 — tâches cron conditionnées par module
- `docs/production.md` § Cron — tâches planifiées
