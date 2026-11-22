# Plan technique — Images du site depuis un assistant IA

- **Spec associée** : `./spec.md` · **Statut** : Brouillon · **Mis à jour le** : 2026-11-22

## Conformité
- [x] Imports via `@/modules/ticketing` et `@/modules/ticketing/auth` ; garde `requireEventAction(id, "site")`
- [x] Aucune permission ni table ajoutée, aucune migration
- [x] Zod sur l'entrée MCP ; contrôles d'image inchangés (`uploadAsset`/`stageAsset`, `safeFetchImage`)
- [x] UI : `PageHeader`, `Field`/`Input`, `Button`, `Alert`, `EmptyState`, `useToast`

## Page « Images du site »
- `src/app/(auth)/billetterie/[id]/images/page.tsx` (serveur) : `requireEventAction(id, "site")` (404 sinon), titre, liste via `listAssets`, composant client.
- Client `SiteImagesUploader.tsx` : `<input type="file" multiple>` + zone de dépôt ; une ligne par fichier (miniature locale, `alt` obligatoire, nom) ; envoi **séquentiel** sur la route existante `POST /api/ticketing/events/[id]/site/assets` (8 Mo, un fichier par appel) ; état par ligne (envoyé, refusé + message) ; rafraîchit la liste (`router.refresh()`).
- Liste : miniature (`/api/ticketing/events/[id]/site/assets/[assetId]?w=640`), nom, alt, dimensions, identifiant copiable.
- Lien « Images du site » ajouté dans `SiteTab.tsx` (carte « Images et fond »).
- Route couverte par le préfixe `/billetterie` déjà déclaré (vérifié par `route-exhaustiveness`).

## MCP
1. **`ticketing_site_upload_link`** (lecture, `readAvailable` du site, dans `_actions/site.ts`) : entrée `{ event }`, sortie `{ url: <APP_URL>/billetterie/<id>/images, instructions }`. URL absolue construite comme ailleurs (`APP_URL || AUTH_URL || NEXTAUTH_URL`).
2. **`upload_ticketing_site_asset_preview`** : `source` devient facultatif et un champ de premier niveau `file` est ajouté :
   ```ts
   file: z.object({ download_url: z.string().url(), file_id: z.string(), mime_type: z.string().optional(), file_name: z.string().optional() }).strict().optional()
   ```
   `superRefine`/contrôle à l'exécution : exactement un de `source`, `file`. `file` ⇒ `safeFetchImage(file.download_url)` (mêmes garanties), nom de repli `file_name`.
   Déclaration `_meta: { "openai/fileParams": ["file"] }` : champ `meta?` ajouté à `McpActionDef`, passé à `server.registerTool(..., { _meta })` dans `src/app/api/mcp/server/route.ts`.
   Description de l'outil : « si l'import direct échoue ou n'est pas disponible, proposer `ticketing_site_upload_link` ».
3. Pas de suivi de redirection ajouté (garde SSRF inchangée) : à réévaluer après le test réel sur ChatGPT si `download_url` redirige.

## Décisions
- **Choix** : réutiliser la route d'upload de l'éditeur, envoi fichier par fichier — *Pourquoi* : aucune nouvelle surface serveur, mêmes contrôles.
- **Choix** : lien vers une page authentifiée plutôt qu'un jeton de dépôt — *Pourquoi* : aucun secret dans la conversation, la session Koinonia suffit.
- **Écarté** : widget dans ChatGPT, extension MCP de fichiers (brouillon) — *Raison* : complexité, prise en charge incertaine.

## Tests
- MCP : `ticketing_site_upload_link` (URL, refus sans droit) ; preview avec `file` (appel de `safeFetchImage` sur `download_url`), refus si `file` et `source` ensemble ou aucun ; `_meta` exposé dans la liste des outils.
- Les tests existants d'import (`url`, `base64`) passent sans modification.
