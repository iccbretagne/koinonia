# Tâches — Images du site depuis un assistant IA

- **Spec** : `./spec.md` · **Plan** : `./plan.md` · **Statut** : Terminé

- [x] **T1** — `McpActionDef.meta` + passage `_meta` à `registerTool` *(`src/app/api/mcp/_actions/*`, `server/route.ts`)*
- [x] **T2** — `upload_ticketing_site_asset_preview` : champ `file`, `source` facultatif, exactement un, `openai/fileParams`, description *(`_actions/site.ts`)*
- [x] **T3** — Outil `ticketing_site_upload_link` + ajout à la liste blanche `MCP_TOOLS` si les outils du site y figurent *(`_actions/site.ts`, `_tools.ts`)*
- [x] **T4** — Page `/billetterie/[id]/images` + `SiteImagesUploader.tsx` *(`src/app/(auth)/billetterie/[id]/images/`)*
- [x] **T5** — Lien depuis `SiteTab.tsx`
- [x] **T6** — Tests MCP (`site-actions.test.ts`, `tools.test.ts`)
- [x] **T7** — Docs : CLAUDE.md (puce site/assistant), CHANGELOG (Non publié), fiche assistant site si elle décrit l'import d'images, statut spec

## Vérification finale
- [x] `npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`
- [x] Branche poussée
