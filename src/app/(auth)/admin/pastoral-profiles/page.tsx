import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader, buttonClasses } from "@/components/ui";
import { requireAuth, requireChurchPermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PastoralProfilesAdmin from "./PastoralProfilesAdmin";

/**
 * Les profils pastoraux sont propres à une église. `?churchId=` (lien depuis la fiche d'une
 * église) cible une autre église que l'église courante : un Super Admin sans rôle dans cette
 * église ne pourrait pas la choisir dans le sélecteur d'église.
 */
export default async function PastoralProfilesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ churchId?: string }>;
}) {
  const session = await requireAuth();
  const { churchId: requestedChurchId } = await searchParams;
  const churchId = requestedChurchId ?? (await getCurrentChurchId(session));
  if (!churchId) return <p className="text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("church:settings", churchId);

  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
  if (!church) return <p className="text-ink-muted">Église introuvable.</p>;

  const profiles = await prisma.pastoralProfile.findMany({
    where: { churchId },
    include: { user: { select: { id: true, name: true, displayName: true, email: true } } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const users = await prisma.user.findMany({
    where: { churchRoles: { some: { churchId } } },
    select: { id: true, name: true, displayName: true, email: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Profils pastoraux"
        description={
          <>
            Église : <span className="font-semibold text-ink">{church.name}</span> — les profils créés
            ici appartiennent à cette église uniquement.
          </>
        }
        actions={
          requestedChurchId ? (
            <Link href={`/admin/churches/${churchId}`} className={buttonClasses("secondary", "md")}>
              <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Revenir à la fiche de l&apos;église
            </Link>
          ) : undefined
        }
      />
      <PastoralProfilesAdmin churchId={churchId} profiles={profiles} users={users} />
    </div>
  );
}
