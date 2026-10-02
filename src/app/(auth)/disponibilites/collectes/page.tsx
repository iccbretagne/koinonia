import Link from "next/link";
import { requireAuth, requireChurchPermission, getCurrentChurchId } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import { listCollectionMonths } from "@/modules/planning";
import AvailabilityTabs from "@/components/AvailabilityTabs";
import { buttonClasses } from "@/components/ui/button-classes";
import CollectionsPanel from "./CollectionsPanel";

/** Collectes par mois (spec 058) : état de chaque mois et ouverture anticipée — `availability:settings`. */
export default async function AvailabilityCollectionsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("availability:settings", churchId);

  const permissions = new Set(
    session.user.churchRoles.filter((r) => r.churchId === churchId).flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const [months, link] = await Promise.all([
    listCollectionMonths(churchId),
    prisma.memberUserLink.findFirst({ where: { userId: session.user.id, churchId, validatedAt: { not: null } }, select: { id: true } }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <AvailabilityTabs self={!!link} team={session.user.isSuperAdmin || permissions.has("absences:view")} collections />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">Collectes des disponibilités</h1>
          <p className="text-sm text-ink-muted mt-1">
            Chaque collecte s&apos;ouvre automatiquement selon les réglages. Vous pouvez ouvrir celle d&apos;un mois à
            l&apos;avance : les STAR concernés sont notifiés immédiatement.
          </p>
        </div>
        <Link href="/disponibilites/parametres" className={buttonClasses("ghost", "md")}>
          Réglages
        </Link>
      </div>
      <CollectionsPanel
        churchId={churchId}
        months={months.map((m) => ({
          month: m.month.toISOString().slice(0, 7),
          eventCount: m.eventCount,
          open: m.open,
          closesAt: m.closesAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
