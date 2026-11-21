import { z } from "zod";
import { ApiError } from "@/lib/api-utils";
import { eventExportSchema } from "@/modules/ticketing/schemas";
import { formatDay, formatTime } from "../../assistant/_data/common";
import { type ActionContext, type ActionResult, type McpActionDef, parisDateTime, refusal } from "./common";
import { eventAction, eventFor, eventRef, type Prepared } from "./ticketing";

/**
 * Dupliquer, exporter et importer un événement de billetterie (spec 084). Tout passe par les
 * services du module : un événement **brouillon**, jamais d'inscrit, de paiement, de rôle ni
 * d'affectation, jamais d'IBAN. Duplication : rôle `configure` sur la source et `ticketing:manage`
 * dans l'église. Export : rôle `configure`, sans aucune donnée personnelle. Import : `ticketing:manage`
 * dans l'église de la connexion (une autre que la source : c'est le but).
 */

const ticketing = () => import("@/modules/ticketing");
const previewDesc = (what: string) => `Aperçu : ${what}. N'enregistre rien. Montrez le résumé et attendez l'accord explicite de la personne avant l'outil de confirmation.`;
const confirmDesc = (what: string) => `Confirme et exécute : ${what}, avec le jeton de l'aperçu, après l'accord explicite de la personne.`;
const jsonify = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const NOT_MANAGER = "Cette action est réservée à l'Admin, à la Secrétaire et au Super Admin de l'église (ticketing:manage).";
const when = (d: Date | string) => `${formatDay(new Date(d))} ${formatTime(new Date(d))}`;

const local = z.string().regex(/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/);
const localField = (what: string) => local.describe(`${what}, « AAAA-MM-JJ HH:MM », heure de Paris`);
const parisLocal = (v: string) => new Date(parisDateTime(v.slice(0, 10), v.slice(11)));

const hasManage = (viewer: ActionContext["viewer"]) => viewer.isSuperAdmin || viewer.permissions.includes("ticketing:manage");
const ticketingAvailable = (viewer: ActionContext["viewer"]) => viewer.modules.includes("ticketing") && viewer.predicates.includes("ticketing");

const SUMMARY = (s: { options: number; variants: number; posts: number; images: number; site: boolean }) =>
  `${s.options} option(s), ${s.variants} plat(s), ${s.posts} poste(s) sans affectation, ${s.site ? `site en brouillon non publié (${s.images} image(s))` : "pas de site"}`;

// ─── Duplication ─────────────────────────────────────────────────────────────

type DuplicatePayload = { eventId: string; title?: string; startsAt: string; endsAt?: string };

const duplicateAction = eventAction({
  action: "duplicate_ticketing_event",
  role: "configure",
  description: previewDesc(
    "dupliquer un événement de billetterie en BROUILLON (titre « … (copie) » par défaut, nouvelle date de début obligatoire ; la fin et les échéances suivent le décalage) : paramétrage, jauge, tarifs, moyens de paiement SANS l'IBAN (à ressaisir), règles, options et plats, postes sans affectations, site en brouillon non publié avec ses images. Ni inscrit, ni paiement, ni rôle, ni affectation. Réservé à l'Admin, la Secrétaire et le Super Admin"
  ),
  confirmDescription: confirmDesc("créer la copie de l'événement en brouillon"),
  input: z.object({
    event: eventRef,
    title: z.string().trim().min(1).max(150).optional().describe("Titre de la copie ; « <titre> (copie) » par défaut"),
    startsAt: localField("Début de la copie"),
    endsAt: localField("Fin de la copie").optional().describe("Fin de la copie ; la durée de l'original par défaut"),
  }),
  prepare: async (input, ctx, event): Promise<Prepared<DuplicatePayload> | string> => {
    const m = await ticketing();
    if (!(await m.isTicketingManager(ctx.session, ctx.churchId))) return NOT_MANAGER;
    const startsAt = parisLocal(input.startsAt);
    const endsAt = input.endsAt ? parisLocal(input.endsAt) : undefined;
    if (endsAt && endsAt <= startsAt) return "La fin doit suivre le début.";
    const source = await m.getEventDetail(event!.id);
    const delta = startsAt.getTime() - source.startsAt.getTime();
    const end = endsAt ?? new Date(source.endsAt.getTime() + delta);
    const title = input.title ?? `${source.title} (copie)`;
    const summary = { options: source.options.length, variants: source.options.reduce((n, o) => n + o.variants.length, 0), posts: 0, images: 0, site: false };
    return {
      lines: [
        `Dupliquer « ${source.title} » en brouillon : « ${title} », du ${when(startsAt)} au ${when(end)} (décalage de ${Math.round(delta / 86_400_000)} jour(s) pour les échéances)`,
        `Repris : paramétrage, jauge ${source.capacity}, tarifs, règles, ${summary.options} option(s) et ${summary.variants} plat(s), postes (sans affectations), site en brouillon non publié avec ses images`,
        "Non repris : inscrits, paiements, rôles, affectations, IBAN (à ressaisir dans le paramétrage)",
        "La copie est en brouillon : personne ne peut encore s'inscrire.",
      ],
      payload: { eventId: event!.id, ...(input.title ? { title: input.title } : {}), startsAt: startsAt.toISOString(), ...(endsAt ? { endsAt: endsAt.toISOString() } : {}) },
    };
  },
  state: async (p) => {
    const d = await (await ticketing()).getEventDetail(p.eventId);
    return { updatedAt: d.updatedAt, options: d.options.map((o) => [o.id, o.variants.length]) };
  },
  execute: async (p, ctx) => {
    const m = await ticketing();
    if (!(await m.isTicketingManager(ctx.session, ctx.churchId))) throw new ApiError(403, NOT_MANAGER);
    const { event, summary } = await m.duplicateEvent(p.eventId, ctx.churchId, ctx.session.user.id, {
      title: p.title,
      startsAt: new Date(p.startsAt),
      endsAt: p.endsAt ? new Date(p.endsAt) : undefined,
    });
    return {
      text: `Copie « ${event.title} » créée en brouillon (identifiant ${event.id}) : ${SUMMARY(summary)}. Ressaisissez l'IBAN et les moyens de paiement, puis ouvrez les inscriptions.`,
      eventId: event.id,
      data: { id: event.id },
    };
  },
  audit: (p, _ctx, data) => ({ action: "CREATE", entityType: "TicketingEvent", entityId: (data as { id: string }).id, details: { duplicatedFrom: p.eventId } }),
});

// ─── Export ──────────────────────────────────────────────────────────────────

const exportInput = z.object({ event: eventRef });

async function exportEvent(input: z.infer<typeof exportInput>, ctx: ActionContext): Promise<ActionResult> {
  const found = await eventFor(ctx, input.event, "configure");
  if (typeof found === "string") return refusal(found);
  const m = await ticketing();
  const json = jsonify(await m.buildEventExport(found.id));
  // L'export doit se relire par l'import : schéma strict, mêmes bornes que les écrans.
  const checked = eventExportSchema.safeParse(json);
  if (!checked.success) return refusal(`Export impossible : ${checked.error.issues.map((i) => `${i.path.join(".") || "export"} : ${i.message}`).join(" ; ")}`);
  const summary = m.summarizeImport(checked.data);
  const text = JSON.stringify(json);
  return {
    text: `Export de « ${found.title} » : ${SUMMARY(summary)}. Aucune donnée personnelle ni IBAN ; moyens de paiement réduits à espèces et chèque ; images en WebP (1280 px au plus). Passez ce JSON tel quel au champ \`data\` de import_ticketing_event_preview :\n${text}`,
    structured: { format: json.format, version: json.version, summary, export: json },
  };
}

// ─── Import ──────────────────────────────────────────────────────────────────

type ImportPayload = { eventId?: undefined; data: Record<string, unknown> };

const importAction = eventAction({
  action: "import_ticketing_event",
  role: "manager",
  description: previewDesc(
    "créer dans l'église courante un événement de billetterie en BROUILLON depuis un JSON produit par export_ticketing_event (même instance ou une autre) : paramétrage, tarifs, options, plats, postes, site avec ses images retraitées. Nouvelle adresse publique ; moyens de paiement à ressaisir ; le JSON est validé strictement (mêmes bornes que les écrans, aucun champ inconnu). Réservé à l'Admin, la Secrétaire et le Super Admin"
  ),
  confirmDescription: confirmDesc("créer l'événement importé en brouillon"),
  input: z.object({ data: z.record(z.string(), z.unknown()).describe("JSON complet renvoyé par export_ticketing_event") }),
  prepare: async (input): Promise<Prepared<ImportPayload> | string> => {
    const data = eventExportSchema.parse(input.data);
    const m = await ticketing();
    const summary = m.summarizeImport(data);
    return {
      lines: [
        `Importer « ${data.event.title} » en brouillon dans cette église, du ${when(data.event.startsAt)} au ${when(data.event.endsAt)}, jauge ${data.event.capacity}`,
        `Sera créé : ${SUMMARY(summary)}, ${data.tariffs.length} tarif(s)`,
        "Non repris : inscrits, paiements, rôles, affectations, IBAN, liens de paiement (à ressaisir)",
        "L'événement est créé en brouillon avec une nouvelle adresse publique.",
      ],
      payload: { data: jsonify(data) as unknown as Record<string, unknown> },
    };
  },
  state: async () => null,
  execute: async (p, ctx) => {
    const m = await ticketing();
    const { event, summary } = await m.importEvent(ctx.churchId, ctx.session.user.id, eventExportSchema.parse(p.data));
    return { text: `Événement « ${event.title} » importé en brouillon (identifiant ${event.id}) : ${SUMMARY(summary)}.`, eventId: event.id, data: { id: event.id } };
  },
  audit: (_p, _ctx, data) => ({ action: "CREATE", entityType: "TicketingEvent", entityId: (data as { id: string }).id, details: { imported: true } }),
});

const exportRead: McpActionDef = {
  name: "export_ticketing_event",
  action: "export_ticketing_event",
  kind: "read",
  description:
    "Exporte un événement de billetterie en JSON versionné (format koinonia-ticketing-event) pour le recréer dans une autre instance avec import_ticketing_event_preview : paramétrage, tarifs, options, plats, postes, site et ses images (WebP 1280 px au plus). Aucune donnée personnelle, aucun IBAN, aucun inscrit ni identifiant de compte. Rôle organisateur de l'événement",
  input: exportInput,
  available: ticketingAvailable,
  run: exportEvent as McpActionDef["run"],
};

const managerOnly = (def: McpActionDef): McpActionDef => ({ ...def, available: (viewer) => def.available(viewer) && hasManage(viewer) });

export const TRANSFER_ACTIONS: McpActionDef[] = [exportRead, ...duplicateAction.map(managerOnly), ...importAction];
