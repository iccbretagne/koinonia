import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DeptFunctionsClient from "./DeptFunctionsClient";
import { PageHeader } from "@/components/ui";

export default async function DeptFunctionsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("events:manage", churchId);

  const departments = await prisma.department.findMany({
    where: { ministry: { churchId } },
    include: { ministry: { select: { name: true } } },
    orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fonctions des départements"
        description="Configurez quel département est en charge de chaque fonction système. Ces assignations déterminent le routage des demandes et les accès aux modules spécialisés."
      />
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
