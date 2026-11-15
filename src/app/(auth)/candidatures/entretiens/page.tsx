import Link from "next/link";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/ui";
import { countToComplete, listInterviewers, listSlots } from "@/modules/serving";
import { requireServingActor } from "@/modules/serving/auth";
import InterviewSlotsClient from "./InterviewSlotsClient";

/** Créneaux d'entretien (spec 082) : équipe Vie des STAR et administration. */
export default async function EntretiensPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;
  const actor = await requireServingActor(churchId);
  if (!actor.canManage) {
    return <EmptyState title="Accès refusé" description="Les entretiens sont réservés à l'équipe Vie des STAR (PVS) et à l'administration." />;
  }
  const now = new Date();
  const [slots, interviewers, toComplete] = await Promise.all([
    listSlots(churchId, {}, now),
    listInterviewers(churchId),
    countToComplete(churchId, now),
  ]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Link href="/candidatures" className="text-sm text-ink-subtle hover:text-brand-text">
        ← Candidatures
      </Link>
      <PageHeader
        title="Entretiens"
        description="Créneaux proposés aux candidats après l'envoi de leur fiche. Chaque créneau reçoit une seule personne."
      />
      <InterviewSlotsClient
        churchId={churchId}
        initialSlots={JSON.parse(JSON.stringify(slots))}
        interviewers={interviewers}
        toComplete={toComplete}
        currentUserId={actor.userId}
      />
    </div>
  );
}
