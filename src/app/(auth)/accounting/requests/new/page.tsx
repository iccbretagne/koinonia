import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewRequestForm from "./NewRequestForm";

export default async function NewAccountingRequestPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) redirect("/accounting/requests");

  // Vérifier la permission de soumission (rôle ou profil pastoral)
  const roles = session.user.churchRoles
    .filter((r) => r.churchId === churchId)
    .map((r) => r.role);
  const perms = roles.flatMap((r: string) => rolePermissions[r as keyof typeof rolePermissions] ?? []);
  const isPastoral = (session.user.pastoralChurchIds ?? []).includes(churchId);

  if (!perms.includes("accounting:submit") && !isPastoral) {
    redirect("/accounting/requests");
  }

  const canManage = perms.includes("accounting:manage");
  const isAdmin = canManage || isPastoral;

  // Départements disponibles :
  // - ADMIN / SUPER_ADMIN / profil pastoral → tous les départements de l'église
  // - MINISTER → tous les départements de ses ministères
  // - DEPARTMENT_HEAD → ses départements assignés uniquement
  // - Fallback : tous les départements si aucun département assigné trouvé
  let departments: { id: string; name: string; ministry: { name: string } }[] = [];

  if (isAdmin) {
    departments = await prisma.department.findMany({
      where: { ministry: { churchId } },
      select: { id: true, name: true, ministry: { select: { name: true } } },
      orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
    });
  } else {
    const userRoles = await prisma.userChurchRole.findMany({
      where: { userId: session.user.id!, churchId },
      include: {
        departments: {
          include: {
            department: { select: { id: true, name: true, ministry: { select: { name: true } } } },
          },
        },
      },
    });

    const isMinister = roles.includes("MINISTER");

    if (isMinister) {
      // Ministères assignés à cet utilisateur
      const ministryIds = userRoles
        .map((r) => r.ministryId)
        .filter(Boolean) as string[];

      if (ministryIds.length > 0) {
        departments = await prisma.department.findMany({
          where: { ministryId: { in: ministryIds } },
          select: { id: true, name: true, ministry: { select: { name: true } } },
          orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
        });
      }
    } else {
      // DEPARTMENT_HEAD : ses départements assignés
      departments = userRoles
        .flatMap((r) => r.departments.map((d) => d.department))
        .filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i)
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    // Fallback : si aucun département trouvé, tous les départements de l'église
    if (departments.length === 0) {
      departments = await prisma.department.findMany({
        where: { ministry: { churchId } },
        select: { id: true, name: true, ministry: { select: { name: true } } },
        orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
      });
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/accounting/requests" className="text-sm text-gray-400 hover:text-icc-violet transition-colors">
          ← Demandes
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-600 font-medium">Nouvelle demande</span>
      </div>
      <NewRequestForm departments={departments} />
    </div>
  );
}
