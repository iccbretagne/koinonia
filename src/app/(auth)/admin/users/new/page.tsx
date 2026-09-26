import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CreateUserClient from "./CreateUserClient";

export default async function CreateUserPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  await requireChurchPermission("users:manage", churchId);

  // Fiches STAR de cette église sans compte lié dans cette église (spec 037 : le lien est
  // propre à une église, un membre peut en avoir un ailleurs sans être exclu ici).
  const availableMembers = await prisma.member.findMany({
    where: {
      departments: { some: { department: { ministry: { churchId } } } },
      userLinks: { none: { churchId } },
    },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const departments = await prisma.department.findMany({
    where: { ministry: { churchId } },
    select: { id: true, name: true, ministry: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Créer un utilisateur</h1>
      <CreateUserClient
        churchId={churchId}
        availableMembers={availableMembers}
        departments={departments.map((d) => ({
          id: d.id,
          name: d.name,
          ministryName: d.ministry.name,
        }))}
      />
    </div>
  );
}
