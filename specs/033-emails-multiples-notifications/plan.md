# Plan technique — Emails multiples pour les notifications comptabilité et secrétariat

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-08-30

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouveau module ; les fichiers touchés vivent tous dans
      `src/app/` (routes/pages) et `src/lib/` (infra partagée) — pas d'import cross-module créé.
- [x] **Sécurité** : la route `PUT /api/churches/[churchId]` reste protégée par
      `requireChurchPermission("church:manage", churchId)` (déjà en place, inchangée), donc
      réservée au Super Admin ; multi-tenant `churchId` déjà respecté, non touché ici.
- [x] **Permissions** via `rolePermissions` : aucune nouvelle permission requise, `church:manage`
      existant suffit.
- [x] **Validation** Zod sur la mutation `PUT /api/churches/[churchId]`.
- [x] **Migration** Prisma prévue (renommage + élargissement de colonne, cf. ci-dessous).
- [x] **Enums** : aucun enum touché.
- [x] **UI** : réutilise `Textarea` (existant, `src/components/ui/Textarea.tsx`) — pas de nouveau
      composant.

## Approche générale

Les deux champs `Church.secretariatEmail` et `Church.accountingEmail` (`String?`, une seule
adresse) deviennent `Church.secretariatEmails` et `Church.accountingEmails` (`String? @db.Text`,
plusieurs adresses stockées sous forme de texte séparé par virgules — même schéma que suggéré
dans l'issue #468, sans table dédiée). Une paire de fonctions utilitaires
(`parseEmailList` / `formatEmailList`) centralise le parsing et la sérialisation ; elle est le
seul endroit qui connaît le format de stockage. Tout le reste du code (API, UI, cron, export de
config) manipule des `string[]`.

`sendEmail` est étendu pour accepter `to: string | string[]` — nodemailer accepte nativement un
tableau de destinataires — donc les deux points d'envoi (notification compta, digest planning)
passent directement la liste de destinataires sans recomposer une chaîne.

L'UI remplace le champ `Input type="email"` unique par un `Textarea` (« une adresse par ligne »),
seule évolution visible pour le Super Admin. Aucun nouveau composant : `Textarea` existe déjà et
n'est utilisé nulle part ailleurs dans l'admin église — c'est le bon outil pour une liste
multi-lignes sans construire un composant "chips".

Migration des données : les colonnes existantes contiennent au plus une adresse par église. La
migration copie leur contenu tel quel dans les nouvelles colonnes (une adresse seule reste une
« liste d'un élément » valide, aucune transformation nécessaire) puis supprime les anciennes
colonnes — satisfait directement le critère de non-régression de la spec.

## Modèle de données

```prisma
model Church {
  // avant : secretariatEmail String?
  // avant : accountingEmail  String?
  secretariatEmails String? @db.Text // adresses séparées par virgules (0..n)
  accountingEmails  String? @db.Text // adresses séparées par virgules (0..n)
  // … reste du modèle inchangé
}
```

Migration (SQL explicite plutôt que `prisma migrate dev` en mode interactif, pour garantir la
préservation des données au lieu d'un drop+add auto-détecté) :

```sql
-- AlterTable: emails multiples pour comptabilité et secrétariat (spec 033)
ALTER TABLE `churches` ADD COLUMN `secretariatEmails` TEXT NULL;
ALTER TABLE `churches` ADD COLUMN `accountingEmails` TEXT NULL;

UPDATE `churches` SET `secretariatEmails` = `secretariatEmail` WHERE `secretariatEmail` IS NOT NULL;
UPDATE `churches` SET `accountingEmails` = `accountingEmail` WHERE `accountingEmail` IS NOT NULL;

ALTER TABLE `churches` DROP COLUMN `secretariatEmail`;
ALTER TABLE `churches` DROP COLUMN `accountingEmail`;
```

Générée via `npx prisma migrate dev --create-only --name multiple_notification_emails`, puis le
fichier `migration.sql` est remplacé par le SQL ci-dessus avant `npx prisma migrate dev` pour
l'appliquer.

## API

| Endpoint | Méthode | Permission | Entrée (champs modifiés) | Sortie |
|---|---|---|---|---|
| `/api/churches/[churchId]` | PUT | `church:manage` | `secretariatEmails: string[]`, `accountingEmails: string[]` (remplacent `secretariatEmail`/`accountingEmail` scalaires) | `Church` avec `secretariatEmails`/`accountingEmails` en `string[]` |

Schéma Zod (remplace les deux lignes scalaires actuelles) :

```typescript
const emailListSchema = z
  .array(z.string().email("Email invalide"))
  .optional()
  .default([]);

const updateSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  slug: z.string().min(1, "Le slug est requis"),
  secretariatEmails:    emailListSchema,
  accountingEmails:     emailListSchema,
  primaryColor:         z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale invalide").optional(),
  responsibleProfileId: z.string().nullish(),
  supervisorProfileId:  z.string().nullish(),
});
```

Le handler `PUT` convertit `data.secretariatEmails`/`data.accountingEmails` (arrays validés,
dédupliqués, normalisés en minuscules) via `formatEmailList(...)` avant l'écriture Prisma, et
renvoie la réponse avec `parseEmailList(...)` pour redonner un tableau au client (cohérence de
contrat, la forme "texte séparé par virgules" ne doit jamais fuiter côté client).

Les routes de sauvegarde/restauration de configuration (`/api/admin/backups/config/import`,
`/preview`) suivent le même renommage de champ dans leur schéma Zod, sans changement de
comportement (elles manipulent déjà des chaînes optionnelles brutes).

## Services / logique métier

Nouveau module utilitaire, ajouté à `src/lib/email.ts` (pas de nouveau module — c'est déjà le
point central des emails) :

```typescript
export function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,;\n]/)) {
    const email = part.trim().toLowerCase();
    if (email) seen.add(email);
  }
  return [...seen];
}

export function formatEmailList(emails: string[]): string | null {
  const list = parseEmailList(emails.join(","));
  return list.length > 0 ? list.join(", ") : null;
}
```

`sendEmail` (`src/lib/email.ts`) : le type `SendEmailOptions.to` passe de `string` à
`string | string[]` ; nodemailer accepte nativement les deux, aucun changement dans le corps de
la fonction.

Points d'appel modifiés :

- `notifyAccountingTeam` (`src/app/api/accounting/requests/route.ts`) : sélectionne
  `accountingEmails` au lieu de `accountingEmail`, calcule
  `const emails = parseEmailList(church?.accountingEmails)`, et n'envoie que si
  `emails.length > 0`, avec `sendEmail({ to: emails, subject, html })`.
- `runPlanningDigest` (`src/app/api/cron/route.ts`) : la requête `findMany` passe de
  `where: { secretariatEmail: { not: null } }` à `where: { secretariatEmails: { not: null } }`
  (le filtre grossier reste au niveau SQL — un `NULL` ne peut jamais contenir d'adresse) ; la
  boucle calcule `const emails = parseEmailList(church.secretariatEmails)` et `continue` si vide,
  puis appelle `sendEmail({ to: emails, subject, html })`.

## UI / composants

`src/app/(auth)/admin/churches/[churchId]/ChurchEditClient.tsx` :

- Les deux `Input type="email"` deviennent deux `Textarea` (`rows={3}`), valeur = les emails
  joints par `"\n"`, label mis à jour (« Emails secrétariat (un par ligne) »,
  « Emails comptabilité (un par ligne) »).
- À la soumission, la valeur brute du textarea est splittée avec la même logique que
  `parseEmailList` côté client (dupliquée en une ligne, pas de dépendance client → serveur pour
  un simple split/trim) avant l'envoi au format `string[]` attendu par l'API.
- La prop `Church` du composant passe de `secretariatEmail: string` /
  `accountingEmail: string` à `secretariatEmails: string[]` / `accountingEmails: string[]`.

`src/app/(auth)/admin/churches/[churchId]/page.tsx` : le `select` Prisma et la construction de
la prop passée au client utilisent les nouveaux noms de champs et `parseEmailList(...)` pour
convertir la valeur texte stockée en `string[]`.

## Décisions & alternatives écartées

- **Choix** : stockage `String? @db.Text` séparé par virgules, plutôt qu'un champ `Json`
  (`string[]`) ou une table dédiée `ChurchNotificationEmail`.
  *Pourquoi* : c'est l'option que l'issue #468 elle-même retient comme la plus simple ; elle ne
  demande ni nouveau type de colonne exotique côté MariaDB, ni relation, ni CRUD séparé, pour un
  besoin qui reste « une poignée d'adresses, toutes traitées à l'identique » (cf. « Hors
  périmètre » de la spec — pas de distinction entre adresses). Une table dédiée serait
  disproportionnée pour une liste sans métadonnée propre (pas d'ordre, pas de libellé, pas de
  statut par adresse).
- **Écarté** : champ `Json` (`string[]`). *Raison* : demande un cast défensif à chaque lecture
  (`Prisma.JsonValue` n'est pas typé `string[]`) pour un gain minime par rapport à un parsing
  texte trivial ; le seul précédent dans le schéma (`AudioServiceTemplate.sequenceNames`) n'est
  pas encore consommé par du code applicatif, ce n'est donc pas un pattern éprouvé dans ce repo.
- **Choix** : renommer les champs (`accountingEmail` → `accountingEmails`, idem secrétariat)
  plutôt que garder le nom singulier. *Pourquoi* : un champ qui peut contenir plusieurs adresses
  mais s'appelle au singulier est trompeur pour quiconque touche ce code ensuite ; le renommage
  est mécanique (peu de points d'usage, tous recensés ci-dessus) et se fait en une seule migration
  avec préservation explicite des données.
- **Choix** : migration SQL écrite à la main (add + copy + drop) plutôt que laisser
  `prisma migrate dev` détecter un renommage. *Pourquoi* : le renommage automatique de colonne
  par Prisma Migrate dépend d'une heuristique interactive (invite « did you rename this column »)
  peu fiable en environnement non interactif ; écrire le SQL explicitement élimine le risque de
  perte de données si Prisma choisit un `DROP` + `ADD` au lieu d'un `RENAME`.
- **Choix** : `Textarea` (une adresse par ligne) plutôt qu'un composant "chips"/tags.
  *Pourquoi* : aucun composant de ce type n'existe dans `src/components/ui/` ; en créer un pour
  ce seul usage serait de la sur-ingénierie au regard du besoin (cf. règle 6 CLAUDE.md). Le
  virgule-ou-retour-à-la-ligne est un pattern déjà familier ailleurs dans l'app pour ce genre de
  saisie libre.
- **Écarté** : limiter arbitrairement le nombre d'adresses par canal. *Raison* : la spec ne pose
  aucune contrainte de ce type et rien dans le contexte (petites équipes d'église) ne le justifie.

## Risques & points d'attention

- **Migration destructive par construction** (elle supprime les anciennes colonnes) : à exécuter
  après vérification que la copie a bien fonctionné (le plan prévoit `UPDATE` avant `DROP`, dans
  la même migration, donc atomique côté transaction MySQL/MariaDB pour un `ALTER`+`UPDATE`
  classique — à vérifier en local avant `db:migrate:deploy` en production).
- **`config-export.ts` / `config-import.ts` / `config-backup-types.ts`** : ces fichiers
  sérialisent déjà `secretariatEmail`/`accountingEmail` en JSON de sauvegarde. Une sauvegarde
  prise **avant** cette migration et restaurée **après** doit encore fonctionner : le plan prévoit
  que l'import accepte à la fois l'ancien nom de champ (valeur simple) et le nouveau (pour ne pas
  casser la restauration d'anciennes sauvegardes) — à trancher précisément en tâche
  d'implémentation, en s'appuyant sur `config-backup.test.ts` existant comme filet de sécurité.
- **`sendEmail({ to: [] })`** ne doit jamais être appelé : les deux points d'appel gardent leur
  garde `if (emails.length > 0)` / `continue`, sinon nodemailer enverrait un email sans
  destinataire.
- **Casse et espaces dans les adresses** : normalisées (trim + lowercase) à l'écriture, pas à la
  lecture historique — les adresses déjà stockées avant cette feature ne sont pas re-normalisées
  rétroactivement (pas nécessaire : elles passent déjà par la validation `.email()` existante).

## Stratégie de tests

- **`parseEmailList` / `formatEmailList`** (`src/lib/email.ts` ou un fichier de test dédié) :
  liste vide, une adresse, plusieurs adresses séparées par virgule/point-virgule/retour à la
  ligne, doublons (dédupliqués), espaces superflus, casse mixte.
- **`PUT /api/churches/[churchId]`** : rejet d'une adresse invalide dans le tableau (comptabilité
  et secrétariat) ; acceptation d'un tableau vide (efface les adresses) ; round-trip
  (écrit un tableau, relit le même tableau dédupliqué).
- **`notifyAccountingTeam`** : envoie à plusieurs adresses quand plusieurs sont configurées ;
  n'envoie rien quand aucune n'est configurée ; continue de fonctionner avec une seule adresse
  (non-régression).
- **`runPlanningDigest`** : même trio de cas que `notifyAccountingTeam`, côté secrétariat.
- **`config-backup.test.ts`** : mis à jour pour les nouveaux noms de champs ; ajoute un cas de
  restauration d'une sauvegarde au format historique (champ singulier) si cette rétrocompatibilité
  est retenue en implémentation.
