import { forbidden } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { PageHeader, buttonClasses } from "@/components/ui";
import { countToComplete, listInterviewers, listSlots } from "@/modules/serving";
import { requireServingActor } from "@/modules/serving/auth";
import InterviewSlotsClient from "./InterviewSlotsClient";
import { paths } from "@/lib/paths";

/** Créneaux d'entretien (spec 082) : équipe Vie des STAR et administration. */
export default async function EntretiensPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;
  const actor = await requireServingActor(churchId);
  if (!actor.canManage) {
    forbidden();
  }
  const now = new Date();
  const [slots, interviewers, toComplete] = await Promise.all([
    listSlots(churchId, {}, now),
    listInterviewers(churchId),
    countToComplete(churchId, now),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link href={paths.candidatures()} className={`${buttonClasses("ghost", "sm")} self-start`}>
        <ArrowLeft className="size-4" aria-hidden="true" /> Retour aux candidatures
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
