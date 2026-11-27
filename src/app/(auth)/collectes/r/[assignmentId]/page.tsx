import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getAssignmentAccess } from "@/modules/campaigns/auth";
import { getAssignmentView } from "@/modules/campaigns";
import AssignmentForm, { type AssignmentViewData } from "@/components/campaigns/AssignmentForm";

type Params = { readonly params: Promise<{ assignmentId: string }> };

export const metadata: Metadata = { title: "Questionnaire de collecte" };

/**
 * Saisie d'un questionnaire de collecte (spec 090) : répondant désigné ou gestionnaire de la
 * campagne. Autre église, brouillon pour un répondant ou aucun droit : 404, sans distinguer.
 */
export default async function AssignmentPage({ params }: Params) {
  const { assignmentId } = await params;
  const session = await requireAuth();
  const access = await getAssignmentAccess(session, assignmentId);
  if (!access) notFound();
  const view = await getAssignmentView(access);

  return (
    <AssignmentForm
      view={JSON.parse(JSON.stringify(view)) as AssignmentViewData}
      apiBase={`/api/campaigns/assignments/${view.assignment.id}`}
      backHref={access.role === "manager" ? `/collectes/${view.campaign.id}` : undefined}
    />
  );
}
