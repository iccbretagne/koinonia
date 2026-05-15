import { requireChurchPermission, getCurrentChurchId } from "@/lib/auth";
import { requireAuth } from "@/lib/auth";
import RequestForm from "./RequestForm";

export default async function AgendaRequestPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Demande de RDV pastoral</h1>
      <p className="text-sm text-gray-500 mb-6">
        Soumettez votre demande. Un qualificateur la traitera et vous sera assigné un créneau.
      </p>
      <RequestForm
        churchId={churchId}
        defaultFirstName={session.user.name?.split(" ")[0] ?? ""}
        defaultLastName={session.user.name?.split(" ").slice(1).join(" ") ?? ""}
        defaultEmail={session.user.email ?? ""}
      />
    </div>
  );
}
