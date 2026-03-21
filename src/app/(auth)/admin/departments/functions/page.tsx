import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DeptFunctionsClient from "./DeptFunctionsClient";

export default async function DeptFunctionsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  await requireChurchPermission("events:manage", churchId);

  const departments = await prisma.department.findMany({
    where: { ministry: { churchId } },
    include: { ministry: { select: { name: true } } },
    orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Fonctions des départements
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Configurez quel département est en charge de chaque fonction. Ces
        assignations déterminent le routage automatique des demandes d&apos;annonces.
      </p>
      <DeptFunctionsClient
        departments={departments.map((d) => ({
          id: d.id,
          name: d.name,
          ministryName: d.ministry.name,
          function: d.function,
        }))}
      />
    </div>
  );
}
