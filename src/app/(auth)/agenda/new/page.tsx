import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireAgendaManage } from "@/modules/agenda/auth";
import { prisma } from "@/lib/prisma";
import NewEntryForm from "./NewEntryForm";

export default async function NewAgendaEntryPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireAgendaManage(churchId);

  const profiles = await prisma.pastoralProfile.findMany({
    where: { churchId },
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  if (profiles.length === 0) {
    return (
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold text-ink mb-4">Ajouter à l&apos;agenda pastoral</h1>
        <div className="p-4 bg-warning-soft border border-warning/30 rounded-lg text-sm text-warning">
          Aucun profil pastoral configuré.{" "}
          <a href="/admin/pastoral-profiles" className="underline">Configurer maintenant →</a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-ink mb-1">Ajouter à l&apos;agenda pastoral</h1>
      <p className="text-sm text-ink-muted mb-6">
        Une activité ou un rendez-vous inscrit directement dans l&apos;agenda d&apos;un pasteur, sans passer par
        une demande de rendez-vous.
      </p>
      <NewEntryForm churchId={churchId} profiles={profiles} />
    </div>
  );
}
