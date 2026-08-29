# Plan technique — Garanties réellement appliquées sur les dépôts et les publications audio/média

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-08-29

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouvel import cross-module ; `src/app/` continue de passer
      par `@/modules/audio` et `@/modules/media` via leur index
- [x] **Sécurité** : les routes touchées conservent leurs guards existants
      (`requireMediaUploadAccess`, `requireAudioAccess`) ; la route publique de comptage reste
      volontairement non authentifiée (jeton de partage), mais gagne le contrôle de statut publié
      qui lui manquait — multi-tenant `churchId` inchangé partout
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — aucune permission ajoutée
- [x] **Validation** Zod sur toutes les mutations — schémas existants conservés, aucun nouveau
      champ accepté du client (la taille réelle est **constatée**, jamais reçue)
- [x] **Migration** Prisma prévue (colonnes + contrainte d'unicité sur `AudioJob`) — pas de
      `db push`
- [x] **Enums** importés depuis `@/generated/prisma/client` — inchangé
- [x] **UI** : aucun composant créé ; le parcours de dépôt côté client n'est pas modifié

## Approche générale

Trois corrections indépendantes, réunies parce qu'elles relèvent du même défaut (une garantie
annoncée mais non appliquée) et de la même chaîne fonctionnelle. Chacune remplace une
vérification **déclarative ou non atomique** par une contrainte que le serveur ou la base fait
respecter :

1. **M-02** — la taille réelle de l'objet déposé est constatée sur S3 (`HeadObject`) au moment de
   la confirmation d'upload, avant d'accepter le fichier. Hors quota → refus, suppression de
   l'objet, aucune version créée. La taille en base est corrigée avec la valeur réelle.
2. **M-03** — une contrainte d'unicité en base sur `(segmentId, sourceHash)` de `AudioJob`, plus
   un `createMany({ skipDuplicates: true })`, rendent la création des jobs RENDER idempotente
   quelle que soit la concurrence — sans verrou applicatif.
3. **M-04** — l'incrément du compteur devient un `updateMany` unique dont le `where` inclut le
   statut publié du service : une seule instruction SQL, donc pas de fenêtre entre le contrôle et
   l'écriture. Zéro ligne touchée → 410, exactement comme le streaming.

## Modèle de données

```prisma
model AudioJob {
  // … champs existants inchangés (payload conservé) …
  segmentId  String?   // renseigné pour les jobs RENDER uniquement
  sourceHash String?   // idem — NULL pour les autres types de job

  @@unique([segmentId, sourceHash])
  @@index([status, leasedUntil])
  @@map("audio_jobs")
}
```

Migration Prisma dédiée (`npm run db:migrate`) : ajout des deux colonnes nullables et de l'index
unique. **MariaDB autorise plusieurs lignes NULL dans un index unique** — les jobs non-RENDER
(et toutes les lignes historiques, laissées à NULL) ne sont donc pas contraints entre eux.

**Pas de backfill des lignes existantes** depuis `payload` : toutes les lignes antérieures sont
terminales (`DONE`/`FAILED`) et `publishAudioService` les ignore déjà — elle ne recrée un job que
si le `sourceHash` du rendu courant diffère. Les laisser à NULL est sans conséquence et évite une
migration de données sur du JSON.

`payload` reste écrit comme aujourd'hui (`{ segmentId, sourceHash }`) : c'est ce que lit le
worker (`handlers/render.ts`), non modifié par cette spec. Les nouvelles colonnes le doublent
pour porter la contrainte, elles ne le remplacent pas.

## API

| Endpoint | Méthode | Permission | Changement |
|---|---|---|---|
| `/api/media/files/[id]` | PATCH | `requireMediaUploadAccess` (inchangé) | Sur `confirmUpload: true`, constate la taille réelle sur S3 avant de créer la version ; refuse (`400`) si hors quota (objet supprimé) ou (`404`) si l'objet est absent ; met `MediaFile.size` à la valeur réelle |
| `/api/audio/public/[token]/play` | POST | aucune (jeton de partage, inchangé) | L'incrément devient conditionnel au statut `PUBLISHED` du culte ; `410` sinon |
| `/api/audio/services/[id]/publish` | POST | `requireAudioAccess("audio:review", …)` (inchangé) | Aucun changement de contrat — la robustesse est gagnée dans le service sous-jacent |

Aucun schéma Zod modifié : le client n'envoie aucun champ nouveau. La taille réelle n'est jamais
une entrée, toujours une constatation serveur — c'est précisément l'objet du correctif.

## Services / logique métier

- **`src/lib/s3.ts`** — nouvelle fonction `getMediaObjectSize(key: string): Promise<number | null>`
  (`HeadObjectCommand` sur `s3Media`/`MEDIA_BUCKET`), retournant `null` si l'objet n'existe pas
  (`NotFound` / `404`) et propageant toute autre erreur. Placée à côté de `deleteMediaFiles`, qui
  est réutilisée telle quelle pour le nettoyage de l'objet hors quota.

- **`src/app/api/media/files/[id]/route.ts`** — dans le bloc `if (data.confirmUpload)`, avant la
  création de `MediaFileVersion` :
  - dériver la clé côté serveur comme aujourd'hui (`getFileOriginalKey`, logique inchangée) ;
  - `getMediaObjectSize(derivedKey)` → `null` : `ApiError(404, "Fichier déposé introuvable …")`
    (rien créé, rien supprimé — il n'y a pas d'objet) ;
  - taille `> MAX_FILE_SIZE` : `deleteMediaFiles([derivedKey])` puis
    `ApiError(400, "Fichier trop lourd (max …)")` — aucune version créée, le `MediaFile` reste en
    `DRAFT` (il pourra être supprimé par la route `DELETE` existante) ;
  - sinon : création de la version comme aujourd'hui **et** `MediaFile.size` mis à la taille
    réelle dans le même `update` que le passage en `IN_REVIEW`.
  - `MAX_FILE_SIZE` est aujourd'hui une constante privée de la route de signature ; elle est
    extraite dans `src/modules/media/` (exportée par l'index du module) pour être partagée par
    les deux routes sans duplication de valeur.

- **`src/modules/audio/services/publish.ts`** — `publishAudioService()` :
  - les entrées de `jobsToCreate` portent désormais aussi `segmentId` et `sourceHash` en colonnes
    (en plus du `payload` inchangé) ;
  - `db.audioJob.createMany({ data: jobsToCreate })` devient
    `db.audioJob.createMany({ data: jobsToCreate, skipDuplicates: true })` — sur publication
    concurrente, la seconde insertion est ignorée silencieusement au lieu de créer un doublon ou
    de lever une erreur d'unicité que l'utilisateur n'aurait pas à voir.
  - Le reste de la fonction (contrôles de dépôt incomplet, `nowReady`, transition
    `READY`/`PUBLISHED`) est **inchangé** — le critère « republication sans changement ne
    déclenche rien » repose sur la comparaison de `sourceHash` déjà en place.

- **`src/app/api/audio/public/[token]/play/route.ts`** — remplacement du couple
  `findUnique` + `update` par un `updateMany` unique :
  ```ts
  const { count } = await prisma.audioSegment.updateMany({
    where: { id: segmentId, serviceId: shareToken.serviceId, service: { status: "PUBLISHED" } },
    data: { playCount: { increment: 1 } },
  });
  if (count === 0) throw new ApiError(410, "Ce culte n'est plus disponible.");
  ```
  Le contrôle d'appartenance du segment au service du jeton (aujourd'hui fait par un `findUnique`
  puis une comparaison) entre dans le même `where` : une seule instruction, plus de fenêtre entre
  la vérification et l'écriture. Le message et le code `410` reprennent **mot pour mot** ceux de
  la route de streaming, conformément à la contrainte de la spec.

## UI / composants

Aucun changement. Le parcours de dépôt côté client (`MediaProjectDetail.tsx`) est inchangé : il
appelle déjà la confirmation après l'upload, et affichera simplement l'erreur renvoyée par
l'API en cas de dépassement, via son traitement d'erreur existant.

## Décisions & alternatives écartées

- **Choix : vérifier la taille à la confirmation (`HeadObject`) plutôt qu'à l'upload** —
  *Pourquoi* : c'est la seule option qui n'oblige pas à changer le mécanisme de transfert côté
  client, explicitement hors périmètre dans la spec. L'étape de confirmation existe déjà
  (`confirmUpload`) et est le point où le fichier entre réellement dans le circuit de revue :
  refuser là garantit qu'aucun fichier hors quota n'est jamais exploitable.
- **Écarté : POST policy S3 avec `content-length-range`** — *Raison* : c'est la contrainte la plus
  forte (S3 refuse le dépôt lui-même, l'octet n'est jamais écrit), mais elle impose de passer d'un
  `PUT` présigné à un `POST` multipart form et donc de réécrire l'upload client. La spec exclut
  ce changement de parcours. À reconsidérer si le volume de dépôts abusifs le justifiait un jour.
- **Écarté : faire confiance à la taille déclarée et se contenter de la corriger a posteriori** —
  *Raison* : corrigerait l'affichage sans jamais empêcher la consommation de stockage, qui est
  l'essentiel du constat.
- **Choix : contrainte d'unicité en base + `skipDuplicates` plutôt qu'un verrou applicatif** —
  *Pourquoi* : `DbClient` est typé `Prisma.TransactionClient`, qui n'expose pas `$transaction` —
  ouvrir une transaction interactive avec `SELECT … FOR UPDATE` depuis `publishAudioService`
  imposerait de changer sa signature et de gérer le cas où elle est déjà appelée dans une
  transaction (c'est le cas depuis le script de migration). La contrainte de base fait respecter
  l'invariant quel que soit l'appelant, sans coordination applicative — et la spec exclut
  explicitement tout verrou distribué.
- **Écarté : déduire la contrainte du champ `payload` JSON** — *Raison* : MariaDB ne permet pas
  d'index unique directement sur une extraction JSON via Prisma ; deux colonnes scalaires
  nullables sont la traduction simple et lisible de la même règle.
- **Choix : `updateMany` conditionnel plutôt qu'un `findUnique` suivi d'un `update`** —
  *Pourquoi* : le constat M-04 porte autant sur le contrôle manquant que sur sa non-atomicité.
  Une seule instruction SQL ferme les deux d'un coup et supprime une requête.

## Risques & points d'attention

- **Contrainte d'unicité et re-rendu légitime** : `(segmentId, sourceHash)` étant unique sur
  **tous** les jobs, y compris terminés, il devient impossible de recréer un job RENDER pour un
  couple déjà traité. En usage normal c'est sans effet (`publishAudioService` ne recrée un job que
  si le hash a changé, donc jamais le même couple). Le cas résiduel — rendu supprimé manuellement
  qu'on voudrait régénérer — nécessiterait de supprimer d'abord l'ancienne ligne de job. À
  documenter dans le commentaire du modèle plutôt que de complexifier la contrainte.
- **Objets déjà déposés hors quota** : la spec exclut explicitement l'assainissement rétroactif.
  Cette correction empêche les nouveaux cas, elle ne nettoie pas l'existant.
- **Un `HeadObject` supplémentaire par confirmation de dépôt** : un aller-retour S3 de plus sur
  une action déjà peu fréquente et non critique en latence — coût négligeable, mentionné pour
  transparence.
- **`MediaFile.size` corrigé à la confirmation** : les fichiers déjà confirmés gardent leur taille
  déclarée (potentiellement fausse). Cohérent avec le hors-périmètre « pas de nettoyage
  rétroactif ».
- **Dépôt audio non traité** : la même faiblesse déclarative existe sur `AUDIO_UPLOAD_MAX_SIZE`
  (`src/modules/audio/services/upload.ts`), volontairement hors périmètre (spec). Le nombre de
  parts signées y étant dérivé de la taille annoncée, le dépassement est bien plus contraint —
  mais la garantie n'est pas absolue pour autant, et le point reste ouvert.

## Stratégie de tests

- **`src/app/api/media/files/__tests__/`** (nouveau fichier de test pour la route `[id]`, ou
  extension de l'existant) — `getMediaObjectSize` mockée :
  - objet plus gros que la limite → réponse 400, `deleteMediaFiles` appelée avec la clé dérivée,
    **aucune** `mediaFileVersion.create`, statut non passé à `IN_REVIEW` ;
  - objet absent (`null`) → réponse 404, aucune création, aucune suppression ;
  - objet dans les clous mais plus petit que la taille déclarée → version créée, `MediaFile.size`
    mis à jour avec la taille **réelle**, passage en `IN_REVIEW` ;
  - `confirmUpload` sur un fichier ayant déjà une version → comportement actuel préservé (aucun
    appel S3, aucune création — garde `existingVersions === 0`).
- **`src/modules/audio/services/__tests__/publish.test.ts`** (existant, à étendre) :
  - les entrées passées à `createMany` portent bien `segmentId` et `sourceHash` en colonnes, en
    plus du `payload` ;
  - `createMany` est appelé avec `skipDuplicates: true` — le test qui verrouille l'idempotence au
    niveau de l'appel, la garantie réelle étant portée par la contrainte de base (non simulable
    avec le mock Prisma, et documentée comme telle) ;
  - les cas existants (aucun job si aucun hash n'a changé, publication immédiate en `PUBLISHED`,
    refus si dépôt incomplet) doivent continuer de passer sans modification — c'est le filet
    anti-régression du critère « republication sans changement ».
- **`src/app/api/audio/public/[token]/play/__tests__/`** (nouveau) :
  - culte publié, jeton valide → `updateMany` appelé avec le `where` incluant
    `service: { status: "PUBLISHED" }`, réponse 200 ;
  - `count === 0` (culte dépublié) → réponse 410 avec le message aligné sur le streaming, aucune
    autre écriture ;
  - jeton révoqué ou segment hors périmètre du jeton → comportements actuels (404 / 403)
    préservés.
