# ADR-0016 — Un domaine par notification, email décidé centralement par préférence utilisateur

- **Statut** : Accepté
- **Date** : 2026-09-25

## Contexte

Avant la spec 053, chaque site qui notifiait un utilisateur décidait lui-même, au cas par cas,
s'il envoyait un email : `if (process.env.SMTP_HOST && user.email) { await sendEmail(...) }`,
répété dans une dizaine de fichiers (comptabilité, rappels de service, suivi pastoral,
intégration, emploi…). Aucun réglage utilisateur n'existait — recevoir un email pour telle
catégorie d'événement ou non n'était jamais un choix, sauf pour l'emploi
(`JobNotificationSubscription`, propre à ce module) et les salles (case à cocher locale à la
réservation).

Cette dispersion a deux conséquences structurelles :

- **impossible d'ajouter un réglage utilisateur sans toucher chaque site un par un** — la
  décision d'envoyer est câblée dans l'appelant, pas dans un point de passage commun ;
- **des comptes liés reçoivent déjà des emails inconditionnels** découverts en cours
  d'implémentation (rappels de service à `member.email` sans vérifier si le membre a un compte
  utilisateur lié, relance MSDP, planification de rendez-vous pastoral) — la préférence, une fois
  ajoutée ailleurs, resterait sans effet sur ces chemins tant qu'ils ne sont pas eux-mêmes migrés.

La spec 053 (issue #581) demande une page « Mes notifications » où chaque utilisateur choisit,
par domaine métier, s'il reçoit des emails — sans toucher aux notifications dans l'app, qui
restent inconditionnelles.

## Décision

**Chaque notification appartient à un domaine, déclaré par le module qui l'émet** (même mécanisme
que les permissions et les routes — ADR-0011, ADR-0012) :

```ts
interface NotificationDomainDescriptor {
  key: string;              // "planning", "care", "accounting", "jobs"…
  label: string;            // libellé affiché
  description: string;
  defaultEmail: boolean;    // valeur tant que l'utilisateur n'a jamais réglé ce domaine
  visibleWith?: string[];   // permissions qui rendent le domaine visible ; absent = toujours visible
}
```

`ModuleRegistry.collectNotificationDomains()` agrège les domaines des modules actifs et rejette
toute clé dupliquée, comme `collectPermissions()`. `Notification.domain` (nullable, backfillé par
migration depuis le `type` historique) et `NotificationEmailPreference(userId, domain, enabled)`
portent la donnée ; le domaine réservé `"*"` est l'interrupteur général.

**La décision d'envoyer un email se prend à un seul endroit : `dispatchUserEmails(userIds,
domain, content)` (`src/lib/notifications.ts`)**, jamais dans le code appelant. Un site qui notifie
appelle `createNotification`/`notifyUsers`/`notifyUsersWithRole`/`notifyDeptMembers` avec un
`domain` **obligatoire** (refus à la compilation sans lui) et un contenu d'email optionnel ; ces
helpers écrivent la ligne in-app puis, hors transaction, délèguent l'email à
`dispatchUserEmails`, qui applique `resolveEmailPreference` (fonction pure : global coupé → non ;
sinon préférence explicite du domaine ; sinon `defaultEmail`) et ajoute le pied de page « Vous
recevez cet email parce que… » avec le lien vers `/profile/notifications`.

**Le domaine `jobs` reste indépendant du réglage détaillé existant
(`JobNotificationSubscription.email`)** — décision affinée en cours d'implémentation par rapport
au plan initial de la spec 053, qui envisageait de les fusionner. Les deux réglages s'appliquent
en cumul : le filtre fin (quels types d'offres suivre, alertes de nouvelles offres) reste géré par
l'abonnement emploi et s'applique **avant** l'appel au mécanisme générique ; la préférence
générique du domaine « Emploi » (activée par défaut) s'ajoute par-dessus. Les coupler aurait
surpris l'utilisateur (décocher l'un aurait changé l'autre) et un utilisateur jamais abonné à une
alerte n'a pas de ligne où stocker la préférence générique.

**Une liste blanche explicite couvre les destinataires sans compte utilisateur** — formulaires
publics, adresses institutionnelles configurées par l'église (`church.accountingEmails`), profils
pastoraux ou membres sans compte lié. Ces sites gardent un `sendEmail` direct, inchangé ; un
test-gardien (comptage statique des imports de `sendEmail` en dehors de cette liste) empêche d'en
ajouter un nouveau sans décision explicite.

## Alternatives considérées

- **Une colonne booléenne par domaine sur `User`** — *Écarté* : une migration à chaque nouveau
  domaine, et la table `User` est partagée avec NextAuth.
- **Laisser chaque site vérifier lui-même la préférence avant d'appeler `sendEmail`** — *Écarté* :
  reproduit exactement le problème d'origine (logique dispersée, contournable), et rien ne
  garantit qu'un nouveau site l'implémente correctement.
- **Fusionner `JobNotificationSubscription.email` dans la préférence générique du domaine
  `jobs`** — *Écarté*, voir ci-dessus.
- **File asynchrone pour l'envoi des emails** — *Écarté* : volumes faibles, pas d'infrastructure
  de file aujourd'hui ; l'erreur est avalée et journalisée par `dispatchUserEmails`, à
  reconsidérer si le volume grossit.

## Conséquences

- **Positif** : ajouter un réglage utilisateur pour un nouveau type de notification ne demande
  plus de toucher le site d'émission — seulement son manifeste.
- **Positif** : plusieurs chemins d'envoi inconditionnel à un compte lié, découverts en migrant
  les dix sites existants (rappels de service, relance MSDP, planification de rendez-vous
  pastoral), sont corrigés au passage : ils respectent désormais la préférence comme tout le reste.
- **Contrainte** : tout nouveau site de notification doit déclarer un `domain` dans le manifeste de
  son module avant de compiler — pas de valeur par défaut, volontairement.
- **Contrainte** : un domaine retiré (module désactivé, ou domaine renommé) laisse des lignes
  `NotificationEmailPreference` orphelines, sans effet — pas de nettoyage automatique, jugé
  superflu au vu du volume.

## Références

- `specs/053-preferences-notifications-email/spec.md` (issue #581), `plan.md`, `tasks.md`
- ADR-0009 (garde de périmètre explicite), ADR-0011/0012 (manifeste, surface HTTP)
