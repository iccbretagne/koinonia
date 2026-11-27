import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getFormAccess, scopeWhere } from "@/modules/forms/auth";
import { formResults, getForm, listFacilitators, listFormManagers, listFormsGrants, listResponses, participantName, usageCounts } from "@/modules/forms";
import { linkableEvents } from "@/app/api/forms/_events";
import { prisma } from "@/lib/prisma";
import FormEditor, { type EditorTab } from "./FormEditor";

type Props = {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ onglet?: string }>;
};

const TABS: EditorTab[] = ["construction", "reglages", "apercu", "reponses", "presence", "resultats"];
const FACILITATOR_TABS: EditorTab[] = ["reponses", "presence", "resultats"];

/** Comptes de l'église, pour désigner les intervenants. */
async function churchMembers(churchId: string) {
  const roles = await prisma.userChurchRole.findMany({
    where: { churchId },
    select: { user: { select: { id: true, name: true, displayName: true, email: true } } },
  });
  const users = new Map(roles.map((r) => [r.user.id, r.user.displayName ?? r.user.name ?? r.user.email]));
  return [...users].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** Comptes avec accès délégué (candidats au partage), hors l'auteur. */
async function grantees(churchId: string, authorId: string | null) {
  const grants = await listFormsGrants(churchId);
  return grants
    .filter((g) => g.userId !== authorId)
    .map((g) => ({ id: g.userId, name: g.name ?? g.email ?? g.userId }));
}

/**
 * Construction, réglages, aperçu, réponses et présence d'un formulaire (spec 079). Un intervenant
 * n'a que les réponses et la présence de son périmètre ; tout autre compte reçoit un 404.
 */
export default async function FormPage({ params, searchParams }: Props) {
  const session = await requireAuth();
  const { id } = await params;
  // Église du formulaire : un formulaire d'une autre église répond comme une adresse inconnue.
  const access = await getFormAccess(session, id);
  const form = access ? await getForm(id) : null;
  if (!access || !form) notFound();
  const manage = access.kind === "manage";
  const { onglet } = await searchParams;
  const tab = (manage ? TABS : FACILITATOR_TABS).find((t) => t === onglet) ?? (manage ? "construction" : "reponses");
  const [usage, church, responses, members, facilitators, linkable, managers, candidates, results] = await Promise.all([
    usageCounts(id),
    prisma.church.findUnique({ where: { id: form.churchId }, select: { slug: true } }),
    tab === "reponses" ? listResponses(id, undefined, scopeWhere(access)) : Promise.resolve([]),
    manage && tab === "reglages" ? churchMembers(form.churchId) : Promise.resolve([]),
    manage && tab === "reglages" ? listFacilitators(id) : Promise.resolve([]),
    manage && tab === "reglages" && form.kind === "PARTICIPATION"
      ? linkableEvents(session, form.churchId, { eventId: form.eventId, ticketingEventId: form.ticketingEventId })
      : Promise.resolve({ events: [], ticketing: [] }),
    manage && tab === "reglages" ? listFormManagers(id) : Promise.resolve([]),
    manage && tab === "reglages" ? grantees(form.churchId, form.createdById) : Promise.resolve([]),
    tab === "resultats" ? formResults(id, scopeWhere(access)).then(({ form: _f, ...r }) => r) : Promise.resolve(null),
  ]);
  // Un intervenant voit les noms, jamais les adresses : la colonne « Répondant » reçoit le nom.
  const shortTexts = form.questions.filter((q) => q.type === "SHORT_TEXT").map((q) => q.id);
  const shown = manage
    ? responses
    : responses.map((r) => ({ ...r, user: null, contactEmail: participantName(r, shortTexts) }));

  return (
    <FormEditor
      tab={tab}
      form={JSON.parse(JSON.stringify(form))}
      churchSlug={church?.slug ?? ""}
      manage={manage}
      members={members}
      facilitators={facilitators}
      linkable={linkable}
      sharing={{
        owner: access.kind === "manage" && access.via !== "comanager",
        managers: managers.map((m) => ({ userId: m.userId, name: m.name, addedBy: m.addedBy })),
        candidates,
      }}
      results={results ? JSON.parse(JSON.stringify(results)) : null}
      usage={{
        responses: usage.responses,
        answeredQuestions: [...usage.answeredQuestions],
        holdingByChoice: Object.fromEntries(usage.holdingByChoice),
        holdingByLevel: Object.fromEntries(usage.holdingByLevel),
      }}
      responses={JSON.parse(JSON.stringify(shown))}
    />
  );
}
