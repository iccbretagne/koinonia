import { prisma } from "@/lib/prisma";

/**
 * Rapprochement des demandes/suivis d'une même personne (spec 052, lot 2), via le dossier de
 * parcours (`PersonJourney`) — encart « Autres demandes de la personne ». Ne porte jamais
 * `subject`/`message`/`notes` : la visibilité de l'encart lui-même (pas son contenu détaillé)
 * est laissée à l'appelant (`canReadContent`), qui seul sait si le lecteur peut voir jusqu'à
 * l'existence d'un accompagnement lié.
 */

export type CareItemKind = "request" | "followup";

export interface RelatedItem {
  kind: CareItemKind;
  id: string;
  status: string;
  createdAt: Date;
}

export async function listRelatedItems(
  personJourneyId: string,
  exclude: { kind: CareItemKind; id: string }
): Promise<RelatedItem[]> {
  const [requests, followups] = await Promise.all([
    prisma.appointmentRequest.findMany({
      where: { personJourneyId },
      select: { id: true, status: true, createdAt: true },
    }),
    prisma.msdpFollowUp.findMany({
      where: { personJourneyId },
      select: { id: true, status: true, createdAt: true },
    }),
  ]);

  const items: RelatedItem[] = [
    ...requests
      .filter((r) => !(exclude.kind === "request" && r.id === exclude.id))
      .map((r) => ({ kind: "request" as const, id: r.id, status: r.status, createdAt: r.createdAt })),
    ...followups
      .filter((f) => !(exclude.kind === "followup" && f.id === exclude.id))
      .map((f) => ({ kind: "followup" as const, id: f.id, status: f.status, createdAt: f.createdAt })),
  ];

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
