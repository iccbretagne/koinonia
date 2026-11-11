import { boundedAnswer } from "@/core/assistant";
import { prisma } from "@/lib/prisma";
import { REFUSED, can, formatDay, paramsSchema, type DataQuestion } from "./common";

/**
 * Questions de données de la bibliothèque audio et des comptes rendus (spec 081, reprises par
 * l'assistant). Un compte rendu n'est cité que par son événement, son orateur et le titre du
 * message — jamais ses notes ni ses décisions.
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

export const REPORTS_QUESTIONS: DataQuestion[] = [
  {
    key: "reports.recent",
    description: "Comptes rendus des 90 derniers jours : événement, orateur et titre du message.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!can(viewer, "reports:view")) return REFUSED;
      const since = new Date(Date.now() - 90 * 86_400_000);
      const reports = await prisma.eventReport.findMany({
        where: { churchId, event: { date: { gte: since } } },
        select: { speaker: true, messageTitle: true, event: { select: { title: true, date: true } } },
        orderBy: { event: { date: "desc" } },
      });
      const items = reports.map((r) => ({
        label: `${formatDay(r.event.date)} · ${r.event.title}`,
        detail: [r.speaker, r.messageTitle].filter(Boolean).join(" · ") || undefined,
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
];
