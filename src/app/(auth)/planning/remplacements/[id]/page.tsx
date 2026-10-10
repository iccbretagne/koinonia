import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasChurchPermission, requireChurchPermission, requireDepartmentAccess, resolveChurchId } from "@/lib/auth";
import PageHeader from "@/components/ui/PageHeader";
import { getWithdrawalDetail } from "@/modules/planning";
import ReplacementClient from "./ReplacementClient";

/**
 * Service à remplacer (spec 061) : atteint depuis la notification de désistement ou le bandeau de
 * la grille. Réservé au périmètre du département (`planning:department`) ; sans `planning:edit`
 * (Secrétaire), l'écran est en lecture seule.
 */
export default async function ReplacementPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  const churchId = await resolveChurchId("serviceWithdrawal", id).catch(() => null);
  if (!churchId) return notFound();
  const session = await requireChurchPermission("planning:department", churchId);

  const owner = await prisma.serviceWithdrawal.findUnique({ where: { id }, select: { departmentId: true } });
  if (!owner) return notFound();
  try {
    requireDepartmentAccess(session, churchId, owner.departmentId);
  } catch {
    return notFound();
  }

  const viewerCanEdit = await hasChurchPermission(session, "planning:edit", churchId);
  const detail = await getWithdrawalDetail(id, { viewerCanEdit });
  if (!detail) return notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={detail.department.name} title="Service à remplacer" description={detail.event.title} />
      <ReplacementClient initial={detail} />
    </div>
  );
}
