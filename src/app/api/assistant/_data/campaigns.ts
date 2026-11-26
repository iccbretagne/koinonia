import type { Session } from "next-auth";
import { z } from "zod";
import { boundedAnswer, type AssistantDataParams, type DataAnswerItem } from "@/core/assistant";
import { prisma } from "@/lib/prisma";
import { REFUSED, formatDay, paramsSchema, type DataQuestion } from "./common";

/**
 * Questions de données des campagnes de collecte (spec 090, lot 5). Lecture d'**état** seulement :
 * jamais une valeur saisie, un nom ou un contenu de fichier, une adresse email ni un répondant ;
 * un questionnaire confidentiel n'expose que son état. Le droit de l'écran (gestionnaire de la
 * campagne, dans l'église de la connexion) est revérifié par `isCampaignManager`.
 */

const campaigns = () => import("@/modules/campaigns");
const campaignsAuth = () => import("@/modules/campaigns/auth");

const pct = (n: number) => `${Math.round(n * 100)} %`;
const due = (d: Date | null) => (d ? `échéance ${formatDay(d)}` : "sans échéance");

/** Campagnes que le compte gère dans l'église de la connexion (plus récentes d'abord). */
async function managedIn(session: Session, churchId: string) {
  const { listMyCampaigns } = await campaigns();
  return (await listMyCampaigns(session)).managed.filter((c) => c.churchId === churchId);
}

/**
 * Campagne visée par identifiant ou clé, parmi celles que le compte gère ; sans référence, la plus
 * récente ouverte, sinon la plus récente. Gestionnaire revérifié objet par objet.
 */
export async function managedCampaign(session: Session, churchId: string, ref?: string) {
  const managed = await managedIn(session, churchId);
  const wanted = ref?.trim();
  const found = wanted
    ? managed.find((c) => c.id === wanted || c.key === wanted)
    : (managed.find((c) => c.status === "OPEN") ?? managed[0]);
  if (!found) return null;
  const { isCampaignManager } = await campaignsAuth();
  return (await isCampaignManager(session, { id: found.id, churchId })) ? found : null;
}

const progressParams: z.ZodType<AssistantDataParams> = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  campaign: z.string().trim().min(1).max(100).optional(),
});

export const CAMPAIGNS_QUESTIONS: DataQuestion[] = [
  {
    key: "campaigns.list",
    description:
      "Campagnes de collecte que la personne gère (titre, clé, état, échéance, taux de questionnaires soumis ou validés) et questionnaires de collecte qu'elle doit remplir (titre, destinataire, état, échéance, lien). Aucune valeur saisie.",
    params: paramsSchema,
    async run({ session, churchId, viewer }) {
      const { CAMPAIGN_STATUS_LABELS, ASSIGNMENT_STATUS_LABELS } = await import("@/modules/campaigns/schemas");
      const { assignmentPath } = await campaigns();
      const managed = await managedIn(session, churchId);
      // Même règle que `getAssignmentAccess` : répondant désigné, campagne sortie du brouillon.
      const mine = await prisma.campaignRespondent.findMany({
        where: { userId: viewer.userId, assignment: { campaign: { churchId, status: { not: "DRAFT" } } } },
        select: {
          assignment: {
            select: {
              id: true,
              label: true,
              status: true,
              dueAt: true,
              form: { select: { title: true } },
              campaign: { select: { title: true, status: true, dueAt: true } },
            },
          },
        },
      });
      const toFill = mine
        .map(({ assignment: a }) => ({ ...a, dueAt: a.dueAt ?? a.campaign.dueAt }))
        .sort((x, y) => Number(x.campaign.status !== "OPEN") - Number(y.campaign.status !== "OPEN") || (x.dueAt?.getTime() ?? Infinity) - (y.dueAt?.getTime() ?? Infinity));
      const items: DataAnswerItem[] = [
        ...managed.map((c) => {
          const done = c.assignments.submitted + c.assignments.validated;
          return {
            label: `Campagne gérée · ${c.title}`,
            detail: [
              `clé ${c.key}`,
              CAMPAIGN_STATUS_LABELS[c.status],
              due(c.dueAt),
              c.assignments.total ? `${pct(done / c.assignments.total)} soumis ou validés (${done}/${c.assignments.total})` : "aucun questionnaire",
            ].join(" · "),
            href: `/collectes/${c.id}`,
          };
        }),
        ...toFill.map((a) => ({
          label: `À remplir · ${a.form.title} — ${a.label}`,
          detail: [
            ASSIGNMENT_STATUS_LABELS[a.status],
            a.campaign.status === "OPEN" ? due(a.dueAt) : `campagne ${CAMPAIGN_STATUS_LABELS[a.campaign.status].toLowerCase()}`,
            a.campaign.title,
          ].join(" · "),
          href: assignmentPath(a.id),
        })),
      ];
      return boundedAnswer({
        title: "Mes collectes",
        href: "/collectes",
        hrefLabel: "Collectes",
        items,
        empty: "Aucune campagne de collecte à gérer ni questionnaire à remplir.",
      });
    },
  },
  {
    key: "campaigns.progress",
    description:
      "Avancement d'une campagne de collecte gérée (paramètre campaign : identifiant ou clé ; à défaut la plus récente ouverte) : par questionnaire et destinataire, état, questions obligatoires manquantes, estimations, à rechercher, fichiers reçus sur attendus ; puis contrôles de cohérence (état et message). Jamais de valeur saisie, de nom de fichier ni d'adresse ; un questionnaire confidentiel ne montre que son état.",
    params: progressParams,
    async run({ session, churchId, params }) {
      const found = await managedCampaign(session, churchId, params.campaign);
      if (!found) return REFUSED;
      const { getCampaignOverview, storedItems } = await campaigns();
      const { ASSIGNMENT_STATUS_LABELS } = await import("@/modules/campaigns/schemas");
      const overview = await getCampaignOverview(found.id);
      if (overview.campaign.churchId !== churchId) return REFUSED;

      const confidentialForms = new Set(overview.forms.filter((f) => f.confidential).map((f) => f.key));
      // Codes des questionnaires confidentiels : un contrôle qui en lit un n'est pas montré.
      const confidentialCodes = new Set<string>();
      if (confidentialForms.size > 0) {
        const rows = await prisma.campaignForm.findMany({ where: { campaignId: found.id, confidential: true }, select: { definition: true } });
        for (const r of rows) for (const item of storedItems(r.definition)) confidentialCodes.add(item.code);
      }

      const items: DataAnswerItem[] = overview.forms.flatMap((f) =>
        f.assignments.map((a) => {
          const status = ASSIGNMENT_STATUS_LABELS[a.status];
          if (f.confidential) return { label: `${f.title} — ${a.label}`, detail: `${status} · confidentiel` };
          const c = a.completeness;
          return {
            label: `${f.title} — ${a.label}`,
            detail: [
              status,
              c.missing.length ? `${c.missing.length} manquante(s)` : "complet",
              c.estimates.length ? `${c.estimates.length} estimation(s)` : "",
              c.toResearch.length ? `${c.toResearch.length} à rechercher` : "",
              c.filesExpected ? `fichiers ${c.filesReceived}/${c.filesExpected}` : "",
              due(a.dueAt),
            ]
              .filter(Boolean)
              .join(" · "),
          };
        })
      );
      const RESULT: Record<string, string> = { ok: "respecté", violated: "à vérifier", skipped: "non évaluable (réponses manquantes)" };
      for (const check of overview.checks) {
        if (check.formKey && confidentialForms.has(check.formKey)) continue;
        if (Object.keys(check.values).some((code) => confidentialCodes.has(code))) continue;
        items.push({ label: `Contrôle · ${check.message}`, detail: [RESULT[check.result] ?? check.result, check.assignmentLabel ?? "ensemble de la campagne"].join(" · ") });
      }

      const p = overview.progress;
      const done = p.byStatus.SUBMITTED + p.byStatus.VALIDATED;
      return boundedAnswer({
        title: `Avancement de « ${overview.campaign.title} » (clé ${overview.campaign.key}) : ${done}/${p.total} soumis ou validés`,
        href: `/collectes/${overview.campaign.id}`,
        hrefLabel: "Pilotage",
        items,
        empty: "Cette campagne n'a encore aucun questionnaire.",
      });
    },
  },
];
