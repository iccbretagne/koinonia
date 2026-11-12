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

/** Tri de textes stable et indépendant de la langue du serveur. */
export const byText = (a: string, b: string) => a.localeCompare(b, "en");

/** Tri de paires [identifiant, valeur] par identifiant. */
export const byKey = (a: readonly unknown[], b: readonly unknown[]) => byText(String(a[0]), String(b[0]));

/**
 * Empreinte d'un état lu à l'aperçu (lot 3) : SHA-256 d'une sérialisation à clés triées. Recalculée
 * à la confirmation ; différente ⇒ les données ont changé, rien n'est fait.
 */
export function fingerprint(value: unknown): string {
  const sorted = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v as object).sort(byText).map((k) => [k, sorted((v as Record<string, unknown>)[k])]));
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

/** Décalage de Paris (ms) à un instant donné. */
function parisOffset(at: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Paris",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value])
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - at;
}

/** Jour et heure à Paris (« 2026-12-06 », « 10:00 ») → instant, changement d'heure compris. */
export function parisDateTime(dayKey: string, time: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const local = Date.UTC(y, m - 1, d, hh, mm);
  const first = local - parisOffset(local);
  return new Date(local - parisOffset(first));
}

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
