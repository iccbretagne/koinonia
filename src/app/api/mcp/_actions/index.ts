import type { AssistantViewer } from "@/core/assistant";
import type { McpActionDef } from "./common";
import { PERSONAL_ACTIONS } from "./personal";
import { PLANNING_ACTIONS } from "./planning";

/**
 * Catalogue des actions d'un assistant IA (spec 081) : lot 2 (sa propre fiche STAR) et lot 3
 * (actions des responsables). Toutes exigent la case « actions confirmées » (portée `write`) ;
 * chacune n'est proposée qu'au compte qui peut la faire dans l'application.
 */
export const MCP_ACTIONS: McpActionDef[] = [...PERSONAL_ACTIONS, ...PLANNING_ACTIONS];

export function actionsFor(viewer: AssistantViewer, write: boolean): McpActionDef[] {
  return write ? MCP_ACTIONS.filter((a) => a.available(viewer)) : [];
}

export * from "./common";
export * from "./personal";
export * from "./draft";
export * from "./planning";
