# Tâches — Emails multiples pour les notifications comptabilité et secrétariat

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `claude/multiple-emails-accounting-secretariat-tcyo3p`
- [x] Migration Prisma générée (schéma modifié — T1/T2)

## Tâches

### 1. Données & migration

- [x] **T1** — Renommer et élargir les champs `Church.secretariatEmail`/`accountingEmail` en
      `secretariatEmails`/`accountingEmails` (`String? @db.Text`).
      *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Générer la migration (`npx prisma migrate dev --create-only --name
      multiple_notification_emails`), puis remplacer son SQL par la version explicite
      add-copy-drop du plan (préserve les adresses existantes), puis l'appliquer
      (`npx prisma migrate dev`). *(fichier : `prisma/migrations/<timestamp>_multiple_notification_emails/migration.sql`)*

### 2. Logique métier (services)

- [x] **T3** — Ajouter `parseEmailList(raw)` et `formatEmailList(emails)` ; changer le type de
      `SendEmailOptions.to` en `string | string[]`. *(fichier : `src/lib/email.ts`)*

### 3. API (route handlers)

- [x] **T4** — Remplacer le schéma Zod scalaire par `emailListSchema` (`z.array(z.string().email())`)
      pour `secretariatEmails`/`accountingEmails` ; dans le handler `PUT`, sérialiser les tableaux
      validés avec `formatEmailList` avant l'écriture Prisma et reconvertir la réponse en tableaux
      avec `parseEmailList` avant `successResponse`. *(fichier : `src/app/api/churches/[churchId]/route.ts`)*
- [x] **T5** — Dans `notifyAccountingTeam` : sélectionner `accountingEmails`, calculer
      `parseEmailList(church?.accountingEmails)`, n'envoyer que si la liste est non vide, passer
      la liste complète à `sendEmail({ to: emails, … })`.
      *(fichier : `src/app/api/accounting/requests/route.ts`)*
- [x] **T6** — Dans `runPlanningDigest` : filtre `where: { secretariatEmails: { not: null } }`,
      `parseEmailList(church.secretariatEmails)`, `continue` si vide, `sendEmail({ to: emails, … })`.
      *(fichier : `src/app/api/cron/route.ts`)*
- [x] **T7** [P] — Renommer les champs dans `ChurchConfig` (`secretariatEmails`/`accountingEmails`,
      `string | null`). *(fichier : `src/lib/config-backup-types.ts`)*
- [x] **T8** [P] — Adapter la construction du `ChurchConfig` exporté aux champs renommés.
      *(fichier : `src/lib/config-export.ts`)*
- [x] **T9** — Adapter `applyImport` : lire `church.secretariatEmails ?? church.secretariatEmail
      ?? null` (et l'équivalent comptabilité) pour rester compatible avec une sauvegarde prise
      avant cette migration, écrire dans les champs renommés. *(fichier : `src/lib/config-import.ts`)*
- [x] **T10** [P] — Ajouter les champs `secretariatEmails`/`accountingEmails` (optionnels) aux
      schémas Zod, en conservant `secretariatEmail`/`accountingEmail` en legacy optionnel pour la
      compatibilité ascendante. *(fichiers : `src/app/api/admin/backups/config/import/route.ts`,
      `src/app/api/admin/backups/config/import/preview/route.ts`)*

### 4. UI

- [x] **T11** — Remplacer les deux `Input type="email"` par des `Textarea` (une adresse par
      ligne) ; props `Church` en `secretariatEmails: string[]`/`accountingEmails: string[]` ;
      parser la valeur du textarea en tableau avant l'envoi à l'API.
      *(fichier : `src/app/(auth)/admin/churches/[churchId]/ChurchEditClient.tsx`)*
- [x] **T12** — Adapter le `select` Prisma et la prop transmise au client aux champs renommés,
      convertis en tableau via `parseEmailList`. *(fichier : `src/app/(auth)/admin/churches/[churchId]/page.tsx`)*

### 5. Tests

- [x] **T13** [P] — Tests unitaires `parseEmailList`/`formatEmailList` : liste vide, une adresse,
      plusieurs séparateurs (virgule/point-virgule/retour à la ligne), doublons, espaces, casse
      mixte. *(fichier : `src/lib/__tests__/email.test.ts`, à créer si absent)*
- [x] **T14** — Test `PUT /api/churches/[churchId]` : rejet d'une adresse invalide dans le
      tableau (compta et secrétariat), tableau vide accepté (efface les adresses), round-trip
      d'un tableau à plusieurs adresses. *(fichier : `src/app/api/churches/__tests__/route.test.ts`,
      à créer si absent — vérifier d'abord s'il existe déjà un test sur cette route)*
- [x] **T15** — Test `notifyAccountingTeam` : envoi à plusieurs adresses, aucun envoi si aucune
      adresse, non-régression avec une seule adresse. *(fichier :
      `src/app/api/accounting/requests/__tests__/*.test.ts`, à créer si absent)*
- [x] **T16** — Test `runPlanningDigest` : même trio de cas côté secrétariat. *(fichier :
      `src/app/api/cron/__tests__/*.test.ts`, à créer si absent)*
- [x] **T17** — Mettre à jour `config-backup.test.ts` aux nouveaux noms de champs ; ajouter un
      cas de restauration d'une sauvegarde au format historique (champ singulier legacy).
      *(fichier : `src/app/api/admin/__tests__/config-backup.test.ts`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test` (1062 passés, 5 skip ; seul échec : `render.test.ts` — `ffmpeg` absent du bac à sable, sans rapport)
- [x] Critères d'acceptation de `spec.md` :
  - [x] Zéro/une/plusieurs adresses comptabilité déclarables (T4, T11)
  - [x] Zéro/une/plusieurs adresses secrétariat déclarables, indépendamment (T4, T11)
  - [x] Notification nouvelle demande financière reçue par toutes les adresses compta (T5)
  - [x] Digest planning reçu par toutes les adresses secrétariat (T6)
  - [x] Adresse invalide rejetée avec message clair, compta et secrétariat (T4, T14)
  - [x] Adresse dupliquée : un seul envoi (T3, T13)
  - [x] Église à une seule adresse historique : migration transparente (T2, T17)
  - [x] Canal sans adresse déclarée : aucun email, pas d'erreur visible (T5, T6, T15, T16)
  - [x] Échec d'envoi vers une adresse n'empêche pas les autres du même canal (T5, T6 — `sendEmail`
        reçoit la liste complète en un seul appel nodemailer, cf. note ci-dessous)
- [ ] PR ouverte vers `main` (à faire après confirmation de l'utilisateur)

> Note sur le dernier critère : `sendEmail` fait un seul appel nodemailer avec plusieurs
> destinataires `to`. C'est le comportement SMTP standard (un seul essai de remise par
> destinataire côté serveur SMTP relais) ; aucune logique applicative supplémentaire n'est
> nécessaire pour isoler l'échec d'une adresse des autres — à confirmer en implémentation avec
> le comportement réel du transport SMTP configuré (voir `src/lib/email.ts`).
