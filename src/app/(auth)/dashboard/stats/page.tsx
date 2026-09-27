import { auth, getCurrentChurchId, requireChurchPermission, getUserDepartmentScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import StatsClient from "./StatsClient";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { Church } from "lucide-react";

interface StatsPageProps {
  readonly searchParams: Promise<{ dept?: string }>;
}

export default async function StatsPage({ searchParams }: StatsPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { dept: initialDeptId } = await searchParams;

  const currentChurchId = await getCurrentChurchId(session);
  if (!currentChurchId) {
    return (
      <EmptyState icon={Church} title="Aucune église" description="Vous n'êtes rattaché à aucune église. Contactez un administrateur." />
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
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Planning du département" title="Statistiques" description="Présence en service et répartition des tâches, par STAR." />
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
