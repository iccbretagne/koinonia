import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewRequestForm from "./NewRequestForm";

export default async function NewAccountingRequestPage() {
  const session = await requirePermission("accounting:submit");
  const churchId = await getCurrentChurchId(session);
  if (!churchId) redirect("/accounting/requests");

  // Départements accessibles à cet utilisateur
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

  const departments = userRoles
    .flatMap((r) => r.departments.map((d) => d.department))
    .filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i)
    .sort((a, b) => a.name.localeCompare(b.name));

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
