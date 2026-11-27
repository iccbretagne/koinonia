import type { AssistantViewer } from "@/core/assistant";
import type { McpActionDef } from "./common";
import { PERSONAL_ACTIONS } from "./personal";
import { PLANNING_ACTIONS } from "./planning";
import { DELEGATE_ACTIONS } from "./delegate";
import { REPORT_ACTIONS } from "./report";
import { EVENT_ACTIONS } from "./events";
import { SERVING_ACTIONS } from "./serving";
import { TICKETING_ACTIONS } from "./ticketing";
import { TICKET_VISUAL_ACTIONS } from "./ticket-visual";
import { SITE_ACTIONS } from "./site";
import { TRANSFER_ACTIONS } from "./event-transfer";
import { CAMPAIGN_ACTIONS } from "./campaigns";

/**
 * Catalogue des actions d'un assistant IA (spec 081) : lot 2 (sa propre fiche STAR) et lot 3
 * (actions des responsables). Toutes exigent la case « actions confirmées » (portée `write`) ;
 * chacune n'est proposée qu'au compte qui peut la faire dans l'application.
 */
export const MCP_ACTIONS: McpActionDef[] = [...PERSONAL_ACTIONS, ...PLANNING_ACTIONS, ...DELEGATE_ACTIONS, ...REPORT_ACTIONS, ...EVENT_ACTIONS, ...SERVING_ACTIONS, ...TICKETING_ACTIONS, ...SITE_ACTIONS, ...TRANSFER_ACTIONS, ...TICKET_VISUAL_ACTIONS, ...CAMPAIGN_ACTIONS];

export function actionsFor(viewer: AssistantViewer, write: boolean): McpActionDef[] {
  return write ? MCP_ACTIONS.filter((a) => a.available(viewer)) : [];
}

export * from "./common";
export * from "./personal";
export * from "./draft";
export * from "./planning";
export * from "./delegate";
export * from "./report";
export * from "./events";
export * from "./serving";
export * from "./ticketing";
export * from "./site";
export * from "./event-transfer";
export * from "./campaigns";
