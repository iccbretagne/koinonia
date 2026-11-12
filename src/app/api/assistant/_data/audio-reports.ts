import { boundedAnswer, cleanText } from "@/core/assistant";
import { prisma } from "@/lib/prisma";
import { exportedSections, filled, statDisplay, type StatItem } from "@/lib/report-stats";
import { anonymize } from "@/modules/assistant";
import { REFUSED, can, dayWindow, formatDay, isOnDay, paramsSchema, type DataQuestion } from "./common";

/**
 * Questions de données de la bibliothèque audio et des comptes rendus (spec 081, reprises par
 * l'assistant). `reports.recent` ne cite que l'événement, l'orateur et le titre du message ;
 * `reports.get` rend le contenu que l'écran du compte rendu montre à `reports:view`, texte libre
 * passé par `anonymize`.
 */

export const AUDIO_QUESTIONS: DataQuestion[] = [
  {
    key: "audio.recentSermons",
    description: "Derniers cultes publiés dans la bibliothèque d'écoute de l'église : date, titre, orateur.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!can(viewer, "audio:listen")) return REFUSED;
      const { listPublishedServices } = await import("@/modules/audio");
      const services = await listPublishedServices({ churchIds: [churchId] });
      const items = services.map((s) => ({
        label: `${formatDay(s.serviceDate)} · ${s.title}`,
        detail: [s.speaker, s.series].filter(Boolean).join(" · ") || undefined,
      }));
      return boundedAnswer({
        title: "Cultes publiés",
        href: "/audio/ecouter",
        hrefLabel: "(re)Écouter",
        items,
        empty: "Aucun culte publié pour l'instant.",
      });
    },
  },
];

/** Statistiques d'une section sur une ligne : « Hommes : 12 | Femmes : 10 · Enfants : 4 ». */
const statsLine = (rows: StatItem[][]) => rows.map((row) => row.map((i) => `${i.short} : ${statDisplay(i.value)}`).join(" | ")).join(" · ");

const NOT_FILLED = "non renseigné";

export const REPORTS_QUESTIONS: DataQuestion[] = [
  {
    key: "reports.recent",
    description:
      "Comptes rendus des 90 derniers jours, du plus récent au plus ancien : date et événement, puis orateur et titre du message " +
      "(« non renseigné » quand le champ est vide), et le lien direct de chaque compte rendu. Le contenu d'un compte rendu s'obtient avec reports_get et sa date.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!can(viewer, "reports:view")) return REFUSED;
      const since = new Date(Date.now() - 90 * 86_400_000);
      const reports = await prisma.eventReport.findMany({
        where: { churchId, event: { reportEnabled: true, date: { gte: since } } },
        select: { speaker: true, messageTitle: true, event: { select: { id: true, title: true, date: true } } },
        orderBy: { event: { date: "desc" } },
      });
      const items = reports.map((r) => ({
        label: `${formatDay(r.event.date)} · ${r.event.title}`,
        detail: speakerAndTitle(r.speaker, r.messageTitle),
        href: reportHref(r.event.id),
      }));
      return boundedAnswer({
        title: "Comptes rendus récents",
        href: "/admin/reports",
        hrefLabel: "Comptes rendus",
        items,
        empty: "Aucun compte rendu sur les 90 derniers jours.",
      });
    },
  },
  {
    key: "reports.get",
    description:
      "Contenu d'un compte rendu : celui du jour donné (day, AAAA-MM-JJ), sinon le plus récent. Une ligne par rubrique : orateur, " +
      "message, puis chaque département (statistiques, dont la fréquentation à l'Accueil, et remarques), observations générales " +
      "et décisions. Rubrique vide = « non renseigné » ; texte libre sans lien, email ni numéro.",
    params: paramsSchema,
    async run({ viewer, churchId, params }) {
      if (!can(viewer, "reports:view")) return REFUSED;
      const select = {
        speaker: true,
        messageTitle: true,
        notes: true,
        decisions: true,
        event: { select: { id: true, title: true, date: true } },
        sections: { select: { label: true, position: true, stats: true, notes: true } },
      } as const;
      let reports;
      if (params.day) {
        const { from, to } = dayWindow(params.day);
        const day = params.day;
        reports = (
          await prisma.eventReport.findMany({ where: { churchId, event: { reportEnabled: true, date: { gte: from, lt: to } } }, select, orderBy: { event: { date: "asc" } } })
        ).filter((r) => isOnDay(r.event.date, day));
      } else {
        reports = await prisma.eventReport.findMany({
          where: { churchId, event: { reportEnabled: true, date: { lte: new Date() } } },
          select,
          orderBy: { event: { date: "desc" } },
          take: 1,
        });
      }
      const several = reports.length > 1;
      const items = reports.flatMap((r) => {
        const prefix = several ? `${cleanText(r.event.title)} · ` : "";
        const sections = exportedSections(
          r.sections.map((s) => ({ ...s, stats: (s.stats as Record<string, number | null> | null) ?? null }))
        );
        return [
          { label: `${prefix}Orateur`, detail: cleanText(r.speaker) || NOT_FILLED },
          { label: `${prefix}Message`, detail: cleanText(r.messageTitle) || NOT_FILLED },
          ...sections.map((s) => ({
            label: `${prefix}${s.label}`,
            detail: [statsLine(s.rows), s.notes ? anonymize(s.notes, 500) : ""].filter(Boolean).join(" · "),
          })),
          { label: `${prefix}Observations générales`, detail: filled(r.notes) ? anonymize(r.notes, 1000) : NOT_FILLED },
          { label: `${prefix}Décisions / actions`, detail: filled(r.decisions) ? anonymize(r.decisions, 1000) : NOT_FILLED },
        ];
      });
      const first = reports[0]?.event;
      return boundedAnswer({
        title: reportTitle(first, several),
        href: first && !several ? reportHref(first.id) : "/admin/reports",
        hrefLabel: "Compte rendu",
        items,
        empty: params.day ? "Aucun compte rendu pour ce jour." : "Aucun compte rendu.",
      });
    },
  },
];

/** Écran d'un compte rendu (lecture et saisie). */
export const reportHref = (eventId: string) => `/admin/events/${eventId}/report`;

/** « Orateur · Titre », avec « non renseigné » pour un champ vide (jamais un séparateur seul). */
function speakerAndTitle(speaker: string | null, messageTitle: string | null): string {
  const who = cleanText(speaker);
  const what = cleanText(messageTitle);
  if (!who && !what) return "Orateur et titre du message non renseignés";
  return `${who || `Orateur ${NOT_FILLED}`} · ${what || `Titre ${NOT_FILLED}`}`;
}

function reportTitle(event: { title: string; date: Date } | undefined, several: boolean): string {
  if (!event) return "Compte rendu";
  return several ? `Comptes rendus du ${formatDay(event.date)}` : `Compte rendu — ${formatDay(event.date)} · ${event.title}`;
}
