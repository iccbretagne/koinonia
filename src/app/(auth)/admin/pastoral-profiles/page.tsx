import Link from "next/link";
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
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("church:settings", churchId);

  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
  if (!church) return <p>Église introuvable.</p>;

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
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-ink mb-1">Profils pastoraux</h1>
      <p className="text-sm text-ink-muted mb-6">
        Église : <span className="font-semibold text-ink">{church.name}</span> — les profils créés
        ici appartiennent à cette église uniquement.
        {requestedChurchId && (
          <>
            {" "}
            <Link href={`/admin/churches/${churchId}`} className="text-brand underline">
              Retour à la fiche de l&apos;église
            </Link>
          </>
        )}
      </p>
      <PastoralProfilesAdmin churchId={churchId} profiles={profiles} users={users} />
    </div>
  );
}
