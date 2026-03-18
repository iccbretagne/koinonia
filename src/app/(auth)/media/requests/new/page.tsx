import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import StandaloneVisualForm from "./StandaloneVisualForm";

export default async function NewStandaloneVisualPage() {
  const session = await requirePermission("planning:view");
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  const churchRoles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  const sourceOptions: { type: "department" | "ministry"; id: string; label: string }[] = [];
  const seenIds = new Set<string>();

  for (const role of churchRoles) {
    if (role.ministryId && !seenIds.has(role.ministryId)) {
      sourceOptions.push({ type: "ministry", id: role.ministryId, label: `Ministère (${role.ministryId})` });
      seenIds.add(role.ministryId);
    }
    for (const { department } of role.departments) {
      if (!seenIds.has(department.id)) {
        sourceOptions.push({ type: "department", id: department.id, label: department.name });
        seenIds.add(department.id);
      }
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Nouvelle demande de visuel</h1>
      <p className="text-sm text-gray-500 mb-6">
        Demande directe à la Production Média, sans lien avec une annonce.
      </p>
      <StandaloneVisualForm churchId={churchId} sourceOptions={sourceOptions} />
    </div>
  );
}
