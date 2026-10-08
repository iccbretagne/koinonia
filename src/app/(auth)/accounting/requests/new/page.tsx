import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewRequestForm from "./NewRequestForm";

type SelectableDepartment = { id: string; name: string; ministry: { name: string } };

const departmentSelect = { id: true, name: true, ministry: { select: { name: true } } } as const;
const departmentOrder = [{ ministry: { name: "asc" as const } }, { name: "asc" as const }];

async function churchDepartments(churchId: string): Promise<SelectableDepartment[]> {
  return prisma.department.findMany({
    where: { ministry: { churchId } },
    select: departmentSelect,
    orderBy: departmentOrder,
  });
}

/**
 * Départements proposés hors administration :
 * - MINISTER → tous les départements de ses ministères
 * - DEPARTMENT_HEAD → ses départements assignés uniquement
 */
async function assignedDepartments(userId: string, churchId: string, isMinister: boolean): Promise<SelectableDepartment[]> {
  const userRoles = await prisma.userChurchRole.findMany({
    where: { userId, churchId },
    include: {
      departments: {
        include: {
          department: { select: departmentSelect },
        },
      },
    },
  });

  if (!isMinister) {
    // DEPARTMENT_HEAD : ses départements assignés
    return userRoles
      .flatMap((r) => r.departments.map((d) => d.department))
      .filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  // Ministères assignés à cet utilisateur
  const ministryIds = userRoles.map((r) => r.ministryId).filter(Boolean) as string[];
  if (ministryIds.length === 0) return [];
  return prisma.department.findMany({
    where: { ministryId: { in: ministryIds } },
    select: departmentSelect,
    orderBy: departmentOrder,
  });
}

/**
 * Départements disponibles : tous ceux de l'église pour l'administration ou un profil pastoral,
 * sinon ceux du rôle — et, à défaut d'en trouver, tous ceux de l'église.
 */
async function selectableDepartments(userId: string, churchId: string, isAdmin: boolean, isMinister: boolean) {
  if (isAdmin) return churchDepartments(churchId);
  const departments = await assignedDepartments(userId, churchId, isMinister);
  // Fallback : si aucun département trouvé, tous les départements de l'église
  return departments.length > 0 ? departments : churchDepartments(churchId);
}

/**
 * « Corriger et resoumettre » : pré-remplit le formulaire depuis la demande rejetée —
 * uniquement la sienne, dans l'église courante, et encore à l'état REJECTED.
 */
async function loadCorrection(correctionOf: string | undefined, churchId: string, userId: string) {
  if (!correctionOf) return null;
  const original = await prisma.financialRequest.findFirst({
    where: { id: correctionOf, churchId, submittedById: userId, status: "REJECTED" },
    select: {
      id: true,
      type: true,
      departmentId: true,
      label: true,
      description: true,
      amount: true,
      _count: { select: { attachments: true } },
    },
  });
  if (!original) return null;
  return {
    id: original.id,
    type: original.type,
    departmentId: original.departmentId,
    label: original.label,
    description: original.description,
    amount: original.amount.toString(),
    attachmentCount: original._count.attachments,
  };
}

export default async function NewAccountingRequestPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ correctionOf?: string; from?: string }>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) redirect("/accounting/requests");
  const { from } = await searchParams;
  const fromRequests = from === "requests";

  // Vérifier la permission de soumission (rôle ou profil pastoral)
  const roles = session.user.churchRoles
    .filter((r) => r.churchId === churchId)
    .map((r) => r.role);
  const perms = new Set(roles.flatMap((r: string) => rolePermissions[r as keyof typeof rolePermissions] ?? []));
  const isPastoral = (session.user.pastoralChurchIds ?? []).includes(churchId);

  if (!perms.has("accounting:submit") && !isPastoral) {
    redirect("/accounting/requests");
  }

  const isAdmin = perms.has("accounting:manage") || isPastoral;
  const departments = await selectableDepartments(session.user.id!, churchId, isAdmin, roles.includes("MINISTER"));
  const { correctionOf } = await searchParams;
  const correction = await loadCorrection(correctionOf, churchId, session.user.id!);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href={fromRequests ? "/requests/new" : "/accounting/requests"}
          className="text-sm text-ink-subtle hover:text-brand-text transition-colors"
        >
          ← {fromRequests ? "Nouvelle demande" : "Demandes"}
        </Link>
        <span className="text-ink-subtle">/</span>
        <span className="text-sm text-ink-muted font-medium">
          {correction ? "Correction" : "Nouvelle demande"}
        </span>
      </div>
      <NewRequestForm
        departments={departments}
        correction={correction}
        redirectTo={fromRequests ? "/requests" : "/accounting/requests"}
      />
    </div>
  );
}
