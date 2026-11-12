import { createHash } from "node:crypto";
import type { Session } from "next-auth";
import { z } from "zod";
import type { AssistantViewer } from "@/core/assistant";

/**
 * Socle des actions d'un assistant IA (spec 081, lots 2 et 3) : toujours en deux appels.
 * `…_preview` vérifie, résume et fige ce qui sera fait derrière un jeton de confirmation (5 min,
 * usage unique, lié à la connexion et à l'action) ; `…_confirm` exécute ce résumé figé, après
 * revérification des droits, par le code métier de l'écran, et journalise « via l'assistant IA ».
 */

export interface ActionContext {
  session: Session;
  churchId: string;
  viewer: AssistantViewer;
  grantId: string;
}

export interface ActionResult {
  text: string;
  structured: Record<string, unknown>;
}

export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const confirmInput = z.object({
  confirmation: z.string().min(10).max(100).describe("Jeton renvoyé par l'aperçu, après l'accord explicite de la personne"),
});

export const CONFIRM_HINT =
  "Montrez ce résumé à la personne et attendez son accord explicite avant d'appeler l'outil de confirmation avec ce jeton (valable 5 minutes).";

export const refusal = (text: string): ActionResult => ({ text, structured: { done: false, reason: text } });

export const EXPIRED = "Confirmation invalide ou expirée : refaites l'aperçu puis confirmez dans les 5 minutes.";
export const CHANGED = "Les données ont changé depuis l'aperçu : refaites l'aperçu et montrez-le de nouveau avant de confirmer.";

/** Bornes d'une période, telles que le formulaire de l'application les envoie (minuit UTC). */
export const dayStart = (d: string) => new Date(`${d}T00:00:00.000Z`);

/** Texte d'un aperçu : rien n'est enregistré, puis le jeton à confirmer. */
export const previewText = (lines: string[], token: string) =>
  `Aperçu — rien n'est encore enregistré.\n${lines.join("\n")}\n\n${CONFIRM_HINT}\nJeton : ${token}`;

/**
 * Empreinte d'un état lu à l'aperçu (lot 3) : SHA-256 d'une sérialisation à clés triées. Recalculée
 * à la confirmation ; différente ⇒ les données ont changé, rien n'est fait.
 */
export function fingerprint(value: unknown): string {
  const sorted = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  return createHash("sha256").update(JSON.stringify(sorted(value))).digest("hex");
}

export interface McpActionDef {
  name: string;
  /** Clé journalisée et liée au jeton de confirmation. */
  action: string;
  /** `read` : lecture utile aux actions (identifiants) ; `preview` ne modifie rien ; `confirm` modifie. */
  kind: "read" | "preview" | "confirm";
  description: string;
  input: z.ZodObject<z.ZodRawShape>;
  /** Le compte peut-il faire cette action dans l'application ? (revérifié à chaque appel). */
  available: (viewer: AssistantViewer) => boolean;
  run: (input: never, ctx: ActionContext) => Promise<ActionResult>;
}

export const hasPermission = (permission: string) => (viewer: AssistantViewer) => viewer.permissions.includes(permission);
