import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { registry } from "@/lib/registry";
import { Church } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import RequestForm from "./RequestForm";
import { loadRequestFormData } from "../request-form-options";

export default async function NewRequestPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) {
    return <EmptyState icon={Church} title="Aucune église sélectionnée" description="Choisissez une église dans le menu." />;
  }
  await requireChurchPermission("members:view", churchId);

  const { churchPermissions, canSubmitDemands, formOptions } = await loadRequestFormData(session, churchId);

  // « Autres demandes » (spec 043) : liens vers des formulaires dédiés, conditionnés par
  // l'activation du module et — pour la compta — le même droit de soumission que sa page dédiée.
  // Le RDV pastoral dépend de `care` (spec 052, ADR-0015), pas d'`agenda`.
  const showCareTile = registry.has("care");
  const isPastoral = (session.user.pastoralChurchIds ?? []).includes(churchId);
  const showAccountingTile =
    registry.has("accounting") &&
    (churchPermissions.has("accounting:submit") || isPastoral);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nouvelle demande" description="Que souhaitez-vous demander ?" />
      <RequestForm
        churchId={churchId}
        canSubmitDemands={canSubmitDemands}
        showCareTile={showCareTile}
        showAccountingTile={showAccountingTile}
        {...formOptions}
      />
    </div>
  );
}
