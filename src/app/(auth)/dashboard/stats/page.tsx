import { auth, getCurrentChurchId, requireChurchPermission, getUserDepartmentScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import StatsClient from "./StatsClient";

interface StatsPageProps {
  searchParams: Promise<{ dept?: string }>;
}

export default async function StatsPage({ searchParams }: StatsPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { dept: initialDeptId } = await searchParams;

  const currentChurchId = await getCurrentChurchId(session);
  if (!currentChurchId) {
    return (
      <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
        Vous n&apos;êtes assigné à aucune église.
      </div>
    );
  }

  // Meme perimetre que /dashboard (planning:department) : l'API /api/departments/[id]/stats
  // l'exigeait deja, mais rien n'empechait un STAR d'ouvrir cette page directement par URL.
  await requireChurchPermission("planning:department", currentChurchId);

  // Le selecteur ne doit lister que les departements du perimetre de l'appelant, sinon un
  // responsable de departement voit les noms de tous les departements de l'eglise.
  const scope = getUserDepartmentScope(session, currentChurchId);
  const departments = await prisma.department.findMany({
    where: {
      ministry: { churchId: currentChurchId },
      ...(scope.scoped ? { id: { in: scope.departmentIds } } : {}),
    },
    include: { ministry: { select: { name: true } } },
    orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Statistiques</h1>
      <StatsClient
        departments={departments.map((d) => ({
          id: d.id,
          name: d.name,
          ministryName: d.ministry.name,
        }))}
        initialDeptId={initialDeptId}
      />
    </div>
  );
}
