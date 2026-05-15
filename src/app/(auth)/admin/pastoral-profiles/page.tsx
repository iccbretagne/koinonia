import { requireChurchPermission, getCurrentChurchId } from "@/lib/auth";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PastoralProfilesAdmin from "./PastoralProfilesAdmin";

export default async function PastoralProfilesPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("church:manage", churchId);

  const profiles = await prisma.pastoralProfile.findMany({
    where: { churchId },
    include: { user: { select: { id: true, name: true, displayName: true, email: true } } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const users = await prisma.user.findMany({
    where: { churchRoles: { some: { churchId } } },
    select: { id: true, name: true, displayName: true, email: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Profils pastoraux</h1>
      <PastoralProfilesAdmin churchId={churchId} profiles={profiles} users={users} />
    </div>
  );
}
