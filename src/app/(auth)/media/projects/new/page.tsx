import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import NewMediaProjectForm from "./NewMediaProjectForm";

export default async function NewMediaProjectPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("media:upload", churchId);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nouveau projet média</h1>
      <NewMediaProjectForm churchId={churchId} />
    </div>
  );
}
