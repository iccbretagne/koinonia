# Guide de migration — v0.19.x → v1.0.0

Ce document liste toutes les actions requises pour mettre à jour une instance Koinonia depuis la branche `0.19.x` vers `1.0.0`.

---

## Avant de commencer

- Créer un backup BDD manuel avant toute opération :
  ```bash
  sudo systemctl start koinonia-backup.service
  # ou via l'interface : Admin → Backups → Déclencher un backup
  ```
- Lire la totalité de ce guide avant d'agir — plusieurs changements sont liés.

---

## 1. Variables d'environnement — BREAKING

### 1a. Renommage `S3_*` → `BACKUP_S3_*`

Toutes les variables du bucket de sauvegarde BDD ont été renommées.

| Ancienne variable | Nouvelle variable |
|---|---|
| `S3_ENDPOINT` | `BACKUP_S3_ENDPOINT` |
| `S3_REGION` | `BACKUP_S3_REGION` |
| `S3_BUCKET` | `BACKUP_S3_BUCKET` |
| `S3_ACCESS_KEY_ID` | `BACKUP_S3_ACCESS_KEY_ID` |
| `S3_SECRET_ACCESS_KEY` | `BACKUP_S3_SECRET_ACCESS_KEY` |

Mettre à jour `/opt/koinonia/shared/.env` avant de redémarrer le service.

### 1b. `MEDIA_S3_*` désormais obligatoires

Avant v1.0, si `MEDIA_S3_*` était absent, l'application utilisait silencieusement les variables `S3_*` (bucket unique). **Ce fallback est supprimé.** Les variables `MEDIA_S3_*` doivent être définies explicitement, même si elles pointent vers le même bucket que les backups.

Ajouter dans `shared/.env` si absent :

```bash
MEDIA_S3_ENDPOINT=https://s3.gra.io.cloud.ovh.net
MEDIA_S3_REGION=gra
MEDIA_S3_BUCKET=koinonia-media
MEDIA_S3_ACCESS_KEY_ID=<access-key-media>
MEDIA_S3_SECRET_ACCESS_KEY=<secret-key-media>
```

> Si vous n'avez pas encore de bucket média dédié, vous pouvez temporairement pointer sur le même bucket que les backups — mais ce n'est pas recommandé en production.

---

## 2. Migrations de base de données

Trois nouvelles migrations depuis v0.19.7 :

| Migration | Contenu |
|---|---|
| `20260413000000_media_module` | Tables du module Média (`media_events`, `media_projects`, `media_files`, `media_photos`, `media_settings`, tokens de validation) |
| `20260414000000_feat_star_role` | Ajout de la valeur `STAR` à l'enum `Role` dans `user_church_roles` |
| `20260416000000_tenant_scope_media_settings` | `MediaSettings` devient multi-tenant — ajout de `churchId`, **suppression de la ligne globale `id='default'`** |

Les migrations s'appliquent automatiquement via le pipeline CD. En cas de déploiement manuel :

```bash
cd /opt/koinonia/current
./node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma
```

### Point d'attention : `media_settings`

La migration `20260416000000` **supprime la ligne `media_settings` avec `id='default'`** si elle existe. Les paramètres médias (watermark, formats acceptés, taille max…) sont réinitialisés aux valeurs par défaut pour chaque église. À reconfigurer après la mise à jour via Admin → Configuration → Paramètres médias.

---

## 3. Changements RBAC

### Gestion des rôles — `events:manage` remplace `departments:manage`

La route `POST/PATCH/DELETE /api/users/[userId]/roles` était protégée par `departments:manage` (SUPER_ADMIN, ADMIN, MINISTER). Elle est désormais protégée par `events:manage` **(SUPER_ADMIN, ADMIN, SECRETARY)**.

**Impact :**
- Les **MINISTER** ne peuvent plus assigner/modifier des rôles directement — cette opération était non intentionnelle.
- Les **SECRETARY** peuvent désormais gérer les rôles non-privilégiés (MINISTER, DEPARTMENT_HEAD, DISCIPLE_MAKER, REPORTER, STAR). C'est une décision explicite v1.0 documentée dans le code.

Vérifier que les workflows existants d'attribution de rôles sont toujours gérés par un SUPER_ADMIN, ADMIN ou SECRETARY.

---

## 4. Module Média — nouveau

Le module Média (ex-Mediaflow) est intégré nativement. Il nécessite :

1. Les variables `MEDIA_S3_*` configurées (voir §1b)
2. Un bucket S3 dédié avec CORS configuré :
   ```json
   [{"AllowedOrigins": ["https://votre-domaine.com"], "AllowedMethods": ["GET"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600}]
   ```
3. Paramétrer les médias par église : Admin → Configuration → Paramètres médias

---

## 5. Migration depuis une instance Mediaflow existante

> **Cette section ne concerne que les instances qui utilisaient Mediaflow comme application séparée.** Si Mediaflow n'était pas déployé, passer à la section suivante.

Le module Média est désormais intégré nativement dans Koinonia. Deux opérations sont nécessaires : importer les données BDD puis synchroniser le bucket S3.

### Prérequis

- Koinonia v1.0 déployé et migrations appliquées (§2)
- Accès à la BDD Mediaflow (`MEDIAFLOW_DB_URL`)
- Accès au bucket S3 Mediaflow en lecture
- `MEDIA_S3_*` configuré et pointant vers le bucket Koinonia (§1b)

### 5a. Import BDD

Le script `import-mediaflow.ts` est **idempotent** : on peut le relancer sans risque.

Capturer la sortie avec `tee` pour conserver un log horodaté tout en voyant la progression en temps réel :

```bash
cd /chemin/vers/koinonia

# Crée un fichier import-YYYYMMDD-HHMMSS.log dans le répertoire courant
LOG="import-$(date +%Y%m%d-%H%M%S).log"
```

**1. Dry-run d'abord — obligatoire :**

```bash
MEDIAFLOW_DB_URL="mysql://user:pass@host:3306/mediaflow" \
npx tsx prisma/scripts/import-mediaflow.ts --dry-run 2>&1 | tee "dry-run-$LOG"
```

Vérifier dans le log :
- Chaque église Mediaflow est correctement mappée à une église Koinonia (matching par nom, insensible à la casse)
- Les counts (churches, users, événements, photos, fichiers, tokens) sont cohérents
- Aucun avertissement `non trouvée` inattendu sur les churches
- Les warnings `Pas de département PRODUCTION_MEDIA` identifient les églises à configurer avant l'import réel
- Les warnings `Nom ambigu` et infos `Aucun STAR trouvé` listent les liaisons membres à créer manuellement après l'import

**2. Import réel :**

```bash
MEDIAFLOW_DB_URL="mysql://user:pass@host:3306/mediaflow" \
npx tsx prisma/scripts/import-mediaflow.ts 2>&1 | tee "$LOG"
```

Conserver les fichiers de log (`dry-run-*.log`, `import-*.log`) — ils servent de preuve d'exécution et facilitent le diagnostic en cas de problème post-migration.

Le script importe dans l'ordre : churches (mapping) → users (déduplication par email) → événements + projets → photos → fichiers + versions → commentaires → share tokens → paramètres médias.

> **Mapping des churches** : la correspondance se fait par nom exact (insensible à la casse). Si un nom diffère légèrement entre Mediaflow et Koinonia, les données liées seront ignorées. Corriger le nom dans l'une des deux bases avant l'import, ou éditer le mapping dans le script.

> **Déduplication users** : un utilisateur dont l'email existe déjà dans Koinonia est réutilisé (son ID Koinonia remplace l'ID Mediaflow dans toutes les FK). Les nouveaux utilisateurs sont créés avec leur ID Mediaflow.

> **Share tokens** : les tokens existants sont préservés avec leur valeur — les URLs de partage déjà distribuées continuent de fonctionner.

### 5b. Synchronisation S3

Copier les objets du bucket Mediaflow vers le bucket média Koinonia.

**1. Dry-run :**

```bash
MEDIAFLOW_S3_ENDPOINT=https://s3.gra.io.cloud.ovh.net \
MEDIAFLOW_S3_BUCKET=mediaflow \
MEDIAFLOW_S3_ACCESS_KEY=xxx \
MEDIAFLOW_S3_SECRET_KEY=yyy \
npx tsx prisma/scripts/sync-s3.ts --from-mediaflow --dry-run
```

Vérifier le nombre d'objets et l'espace estimé avant de lancer.

**2. Synchronisation réelle :**

```bash
MEDIAFLOW_S3_ENDPOINT=https://s3.gra.io.cloud.ovh.net \
MEDIAFLOW_S3_BUCKET=mediaflow \
MEDIAFLOW_S3_ACCESS_KEY=xxx \
MEDIAFLOW_S3_SECRET_KEY=yyy \
npx tsx prisma/scripts/sync-s3.ts --from-mediaflow
```

Le script est idempotent (compare les ETags) — les objets déjà présents dans le bucket Koinonia ne sont pas recopiés.

Pour limiter la synchronisation à un préfixe :

```bash
# Seulement les événements
npx tsx prisma/scripts/sync-s3.ts --from-mediaflow --prefix=media-events/
```

### 5c. Validation post-import

```bash
# Vérifier la connectivité et les droits sur le bucket cible
npx tsx prisma/scripts/debug-s3.ts --media

# Compter les objets importés dans Koinonia
npx tsx prisma/scripts/debug-s3.ts --media 2>&1 | grep -i "objects\|objets"
```

Dans l'interface Koinonia :
- Médias → Événements : les événements Mediaflow doivent apparaître
- Ouvrir un événement → vérifier que les photos se chargent (URLs signées S3)
- Tester un share token existant (lien `/v/[token]` ou `/g/[token]`)

### 5d. Décommissionnement Mediaflow (optionnel)

Une fois la migration validée :

1. Mettre Mediaflow en mode maintenance ou couper le service
2. Conserver le bucket S3 Mediaflow en lecture seule pendant 30 jours minimum (filet de sécurité)
3. Après validation, planifier la suppression du bucket avec `purge-s3.ts` :
   ```bash
   npx tsx prisma/scripts/purge-s3.ts \
     --endpoint=https://s3.gra.io.cloud.ovh.net \
     --bucket=mediaflow \
     --access-key=xxx \
     --secret-key=yyy \
     --dry-run
   ```

---

## 7. Rôle STAR — nouveau

Un nouveau rôle `STAR` est disponible dans `user_church_roles`. Il permet aux membres (STAR) de se connecter et d'accéder à leur planning personnel (`/planning`). L'attribution se fait via :

- **Admin → Accès & rôles → onglet STAR** : liaison compte utilisateur ↔ membre
- **Profil utilisateur** : demande de liaison via `MemberLinkRequest`

Aucune action requise pour les comptes existants — le rôle n'est attribué qu'à la demande.

---

## 8. Séquence de déploiement recommandée

```
1. Backup BDD manuel
2. Mettre à jour shared/.env :
   - Renommer S3_* → BACKUP_S3_*
   - Ajouter MEDIA_S3_*
3. Déployer la nouvelle release (pipeline CD ou manuel)
   → les migrations s'appliquent automatiquement
4. Vérifier les logs : sudo journalctl -u koinonia -n 50
5. Reconfigurer les paramètres médias si nécessaire
6. Tester :
   - Connexion / session
   - Planning (lecture + édition)
   - Backup manuel → vérifier présence dans S3
   - Upload média (si module utilisé)
```

---

## 9. Checklist

- [ ] Backup BDD créé avant la mise à jour
- [ ] `S3_*` renommé en `BACKUP_S3_*` dans `shared/.env`
- [ ] `MEDIA_S3_*` ajouté dans `shared/.env`
- [ ] 3 migrations appliquées (`20260413`, `20260414`, `20260416`)
- [ ] Paramètres médias reconfigurés dans l'interface (si module utilisé)
- [ ] Vérification RBAC : MINISTER ne peut plus assigner de rôles directement
- [ ] Tests fonctionnels post-déploiement
- [ ] **(si Mediaflow)** Dry-run `import-mediaflow.ts` validé
- [ ] **(si Mediaflow)** Import BDD exécuté et validé
- [ ] **(si Mediaflow)** Synchronisation S3 `sync-s3.ts --from-mediaflow` exécutée
- [ ] **(si Mediaflow)** Événements et photos visibles dans Koinonia
- [ ] **(si Mediaflow)** Share tokens existants fonctionnels
