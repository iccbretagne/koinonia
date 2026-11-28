import { z } from "zod";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { consumeConfirmation, createConfirmation, publicOrigin } from "@/modules/mcp";
import type { createSlots } from "@/modules/serving";
import { DEFAULT_INTERVIEW_MINUTES } from "@/modules/serving/schemas";
import { formatDay, formatTime } from "../../assistant/_data/common";
import { EXPIRED, confirmInput, day, hhmm, previewText, refusal, type ActionContext, type ActionResult, type McpActionDef } from "./common";
import { paths } from "@/lib/paths";

/**
 * Créneaux d'entretien de candidature (spec 082) : l'équipe Vie des STAR (ou l'Admin) les crée
 * depuis son assistant, un par un ou en série. Règles de l'écran partagées (`planSlots`,
 * `createSlots`) ; droit revérifié à l'aperçu et à la confirmation. Le module est chargé à la
 * demande : il peut être désactivé (`ENABLED_MODULES`).
 */

const NOT_ALLOWED = "Les créneaux d'entretien sont réservés à l'équipe Vie des STAR et à l'Admin de l'église.";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export const createInterviewSlotsInput = z.object({
  slots: z
    .array(z.object({ day: day.describe("AAAA-MM-JJ"), time: hhmm.describe("HH:MM, heure de Paris") }))
    .max(50)
    .optional()
    .describe("Créneaux un par un (sinon `series`)"),
  series: z
    .object({
      days: z.array(day).min(1).max(62).describe("Jours AAAA-MM-JJ"),
      from: hhmm.describe("Début de la plage, HH:MM"),
      to: hhmm.describe("Fin de la plage, HH:MM"),
    })
    .optional()
    .describe("Série : chaque jour, des créneaux de la durée donnée entre `from` et `to`"),
  durationMinutes: z.number().int().min(5).max(240).optional().describe(`Durée de chaque créneau, ${DEFAULT_INTERVIEW_MINUTES} min par défaut`),
  interviewer: z.string().trim().min(1).max(100).optional().describe("Nom de la personne de l'équipe Vie des STAR qui reçoit ; la personne connectée par défaut"),
  location: z.string().trim().max(200).optional().describe("Lieu (sinon visioUrl)"),
  visioUrl: z.string().trim().max(500).pipe(z.url().startsWith("https://")).optional().describe("Lien de visio https"),
});

type SlotsInput = z.infer<typeof createInterviewSlotsInput>;
type Payload = { input: Parameters<typeof createSlots>[1]; count: number };

const serving = () => import("@/modules/serving");
const canManage = async (ctx: ActionContext) => (await (await import("@/modules/serving/auth")).servingActorFromSession(ctx.session, ctx.churchId).catch(() => null))?.canManage ?? false;

async function toServiceInput(input: SlotsInput, ctx: ActionContext): Promise<Parameters<typeof createSlots>[1] | string> {
  if (!!input.slots === !!input.series) return "Donnez soit `slots`, soit `series`.";
  if (input.location && input.visioUrl) return "Un lieu ou un lien de visio, pas les deux.";
  const team = await (await serving()).listInterviewers(ctx.churchId);
  const interviewer = input.interviewer
    ? team.filter((t) => norm(t.name).includes(norm(input.interviewer!)))
    : team.filter((t) => t.id === ctx.viewer.userId);
  if (interviewer.length !== 1) {
    return interviewer.length > 1
      ? `Plusieurs personnes correspondent : ${interviewer.map((t) => t.name).join(", ")}.`
      : `Personne de l'équipe Vie des STAR trouvée${input.interviewer ? ` pour « ${input.interviewer} »` : " pour votre compte : précisez `interviewer`"}. Équipe : ${team.map((t) => t.name).join(", ") || "aucune"}.`;
  }
  const place = { durationMinutes: input.durationMinutes ?? DEFAULT_INTERVIEW_MINUTES, location: input.location ?? null, visioUrl: input.visioUrl ?? null, interviewerId: interviewer[0].id };
  return input.series ? { series: { ...input.series, ...place } } : { slots: input.slots!.map((s) => ({ ...s, ...place })) };
}

export async function previewCreateInterviewSlots(input: SlotsInput, ctx: ActionContext): Promise<ActionResult> {
  if (!(await canManage(ctx))) return refusal(NOT_ALLOWED);
  const serviceInput = await toServiceInput(input, ctx);
  if (typeof serviceInput === "string") return refusal(serviceInput);
  let rows;
  try {
    rows = await (await serving()).planSlots(ctx.churchId, serviceInput);
  } catch (error) {
    if (error instanceof ApiError) return refusal(error.message);
    throw error;
  }
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "create_interview_slots", { input: serviceInput, count: rows.length } satisfies Payload);
  const first = rows[0];
  const lines = [
    `${rows.length} créneau(x) d'entretien de ${first.durationMinutes} min, ${first.visioUrl ? "en visio" : (first.location ?? "lieu non précisé")} :`,
    ...rows.slice(0, 30).map((r) => `- ${formatDay(r.start)} ${formatTime(r.start)}`),
    ...(rows.length > 30 ? [`… et ${rows.length - 30} autre(s).`] : []),
    "Ils seront proposés aux candidats dès leur création ; les candidatures « À planifier » seront invitées par email.",
  ];
  return {
    text: previewText(lines, token),
    structured: { done: false, action: "create_interview_slots", count: rows.length, confirmation: token, expiresAt: expiresAt.toISOString() },
  };
}

export async function confirmCreateInterviewSlots(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const payload = (await consumeConfirmation(ctx.grantId, "create_interview_slots", input.confirmation)) as Payload | null;
  if (!payload) return refusal(EXPIRED);
  if (!(await canManage(ctx))) return refusal(NOT_ALLOWED);
  let created: number;
  try {
    // Mêmes règles qu'à l'aperçu, revérifiées : un créneau pris ou passé entre-temps ⇒ refus.
    created = await (await serving()).createSlots(ctx.churchId, payload.input, ctx.viewer.userId);
  } catch (error) {
    if (error instanceof ApiError) return refusal(`${error.message} Aucun créneau n'est créé : refaites l'aperçu.`);
    throw error;
  }
  await logAudit({
    userId: ctx.viewer.userId,
    churchId: ctx.churchId,
    action: "CREATE",
    entityType: "ServingInterviewSlot",
    entityId: ctx.churchId,
    details: { created, series: "series" in payload.input, via: "mcp" },
  });
  const link = `${publicOrigin()}${paths.candidatures.entretiens()}`;
  return { text: `${created} créneau(x) créé(s).\nVoir dans Koinonia : ${link}`, structured: { done: true, action: "create_interview_slots", created, link } };
}

const available = (viewer: ActionContext["viewer"]) =>
  viewer.modules.includes("serving") && (viewer.isSuperAdmin || viewer.predicates.includes("pvsTeam") || viewer.permissions.includes("serving:manage"));

export const SERVING_ACTIONS: McpActionDef[] = [
  {
    name: "create_interview_slots_preview",
    action: "create_interview_slots",
    kind: "preview",
    description:
      "Prépare des créneaux d'entretien pour les candidats au service (un par un ou en série : jours, plage horaire, durée, personne de l'équipe Vie des STAR qui reçoit, lieu ou visio). N'enregistre rien : liste des créneaux et un jeton. Montrez le résumé et attendez l'accord explicite de la personne avant create_interview_slots_confirm.",
    input: createInterviewSlotsInput,
    available,
    run: previewCreateInterviewSlots as McpActionDef["run"],
  },
  {
    name: "create_interview_slots_confirm",
    action: "create_interview_slots",
    kind: "confirm",
    description: "Crée les créneaux d'entretien préparés par create_interview_slots_preview, avec son jeton.",
    input: confirmInput,
    available,
    run: confirmCreateInterviewSlots as McpActionDef["run"],
  },
];
