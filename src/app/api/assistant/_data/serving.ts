import { boundedAnswer, quoted } from "@/core/assistant";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/paris-days";
import { REFUSED, formatDay, formatTime, fullName, paramsSchema, type DataQuestion } from "./common";
import { paths } from "@/lib/paths";

/**
 * Questions de données des entretiens de candidature (spec 082). Même droit que l'écran
 * `/candidatures/entretiens` (équipe Vie des STAR, `serving:manage`, Super Admin), revérifié par
 * `servingActorFromSession` ; prénom et nom du candidat seulement, jamais une coordonnée.
 */

async function canManage(session: Parameters<DataQuestion["run"]>[0]["session"], churchId: string) {
  const { servingActorFromSession } = await import("@/modules/serving/auth");
  return (await servingActorFromSession(session, churchId).catch(() => null))?.canManage ?? false;
}

const place = (s: { location: string | null; visioUrl: string | null }) => (s.visioUrl ? "Visio" : (s.location ?? "Lieu non précisé"));

export const SERVING_QUESTIONS: DataQuestion[] = [
  {
    key: "serving.myInterviews",
    description: "Entretiens de candidature à venir que la personne reçoit : date, heure, candidat (prénom et nom), lieu ou visio.",
    params: paramsSchema,
    async run({ session, churchId, viewer }) {
      if (!(await canManage(session, churchId))) return REFUSED;
      const rows = await prisma.servingInterview.findMany({
        where: { status: "BOOKED", interviewerId: viewer.userId, startsAt: { gt: new Date() }, application: { churchId } },
        select: { startsAt: true, location: true, visioUrl: true, application: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { startsAt: "asc" },
      });
      return boundedAnswer({
        title: "Mes entretiens",
        href: paths.candidatures.entretiens(),
        hrefLabel: "Entretiens",
        items: rows.map((r) => ({
          label: `${formatDay(r.startsAt)} ${formatTime(r.startsAt)} · ${quoted(fullName(r.application), 80)}`,
          detail: place(r),
          href: paths.candidatures.application(r.application.id),
        })),
        empty: "Vous ne recevez aucun entretien à venir.",
      });
    },
  },
  {
    key: "serving.toPlan",
    description: "Candidatures encore à l'étude sans rendez-vous d'entretien (« À planifier ») : candidat, raison, depuis quand.",
    params: paramsSchema,
    async run({ session, churchId }) {
      if (!(await canManage(session, churchId))) return REFUSED;
      const { SCHEDULING_REASON_LABEL } = await import("@/modules/serving/schemas");
      const { countToComplete } = await import("@/modules/serving");
      const toComplete = await countToComplete(churchId);
      const rows = await prisma.servingApplication.findMany({
        where: { churchId, status: "RECEIVED", schedulingReason: { not: null } },
        select: { id: true, firstName: true, lastName: true, schedulingReason: true, schedulingSince: true },
        orderBy: { schedulingSince: "asc" },
      });
      return boundedAnswer({
        title: toComplete > 0 ? `Candidatures à planifier (et ${toComplete} entretien(s) à compléter)` : "Candidatures à planifier",
        href: paths.candidatures(),
        hrefLabel: "Candidatures",
        items: rows.map((r) => ({
          label: quoted(fullName(r), 80),
          detail: `${SCHEDULING_REASON_LABEL[r.schedulingReason!]}${r.schedulingSince ? ` · depuis le ${formatDay(r.schedulingSince)}` : ""}`,
          href: paths.candidatures.application(r.id),
        })),
        empty: "Aucune candidature n'attend de rendez-vous.",
      });
    },
  },
  {
    key: "serving.freeSlots",
    description: "Créneaux d'entretien libres à venir de l'église (ou d'un jour donné) : date, heure, durée, personne qui reçoit, lieu ou visio.",
    params: paramsSchema,
    async run({ session, churchId, params }) {
      if (!(await canManage(session, churchId))) return REFUSED;
      const { listFreeSlots } = await import("@/modules/serving");
      const slots = (await listFreeSlots(churchId)).filter((s) => !params.day || dayKey(new Date(s.startsAt)) === params.day);
      return boundedAnswer({
        title: "Créneaux d'entretien libres",
        href: paths.candidatures.entretiens(),
        hrefLabel: "Entretiens",
        items: slots.map((s) => {
          const at = new Date(s.startsAt);
          return {
            label: `${formatDay(at)} ${formatTime(at)} · ${s.durationMinutes} min`,
            detail: [s.interviewerName ? `avec ${s.interviewerName}` : "", s.visioUrl ? "Visio" : (s.location ?? "")].filter(Boolean).join(" · "),
          };
        }),
        empty: "Aucun créneau libre à venir : ajoutez-en depuis l'écran Entretiens.",
      });
    },
  },
];
