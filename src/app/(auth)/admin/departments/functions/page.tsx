import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DeptFunctionsClient from "./DeptFunctionsClient";

export default async function DeptFunctionsPage() {
  const session = await requirePermission("events:manage");
  const churchId = await getCurrentChurchId(session);

  const departments = await prisma.department.findMany({
    where: churchId
      ? { ministry: { churchId } }
      : { ministry: { churchId: session.user.churchRoles[0]?.churchId } },
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
