import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const churchIds = Array.from(
    new Set(session.user.churchRoles.map((r) => r.churchId))
  );

  // Liens STAR existants
  const links = await prisma.memberUserLink.findMany({
    where: { userId: session.user.id },
    include: {
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true, ministry: { select: { name: true } } } },
        },
      },
      church: { select: { id: true, name: true } },
    },
  });

  // Demandes en attente
  const pendingRequests = await prisma.memberLinkRequest.findMany({
    where: { userId: session.user.id, status: "PENDING" },
    include: { church: { select: { id: true, name: true } } },
  });

  // Demandes rejetées récentes (dernière en date par église)
  const rejectedRequests = await prisma.memberLinkRequest.findMany({
    where: { userId: session.user.id, status: "REJECTED" },
    include: { church: { select: { id: true, name: true } } },
    orderBy: { reviewedAt: "desc" },
  });

  // Églises sans lien ni demande en attente (l'utilisateur peut en faire une)
  const linkedChurchIds = new Set(links.map((l) => l.church.id));
  const pendingChurchIds = new Set(pendingRequests.map((r) => r.church.id));

  const churches = await prisma.church.findMany({
    where: churchIds.length > 0 ? { id: { in: churchIds } } : undefined,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const unlinkableChurches = churches.filter(
    (c) => !linkedChurchIds.has(c.id) && !pendingChurchIds.has(c.id)
  );

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Mon profil</h1>

      {/* Infos compte */}
      <div className="bg-white rounded-lg border-2 border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Compte</h2>
        <div className="flex items-center gap-4">
          {session.user.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="w-16 h-16 rounded-full" />
          )}
          <div>
            <p className="font-semibold text-gray-900">{session.user.displayName ?? session.user.name}</p>
            {session.user.displayName && session.user.name && session.user.displayName !== session.user.name && (
              <p className="text-sm text-gray-500">Compte Google : {session.user.name}</p>
            )}
            <p className="text-sm text-gray-500">{session.user.email}</p>
          </div>
        </div>
      </div>

      {/* Liens STAR */}
      <div className="bg-white rounded-lg border-2 border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Fiche STAR liée</h2>
        {links.length === 0 && pendingRequests.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune fiche STAR liée.</p>
        ) : (
          <div className="space-y-3">
            {links.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="font-medium text-gray-900">{l.member.firstName} {l.member.lastName}</p>
                  <p className="text-xs text-gray-500">
                    {l.member.department.ministry.name} / {l.member.department.name}
                  </p>
                  {l.member.department.name === "Sans département" && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      Profil incomplet — contactez un administrateur pour être rattaché à un département.
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400">{l.church.name}</span>
              </div>
            ))}
            {pendingRequests.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />
                  <p className="text-sm text-gray-600">Demande en cours de traitement</p>
                </div>
                <span className="text-xs text-gray-400">{r.church.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Demandes rejetées */}
      {rejectedRequests.length > 0 && (
        <div className="bg-white rounded-lg border-2 border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Demandes rejetées</h2>
          <div className="space-y-3">
            {rejectedRequests.map((r) => (
              <div key={r.id} className="py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{r.church.name}</span>
                  <span className="text-xs text-gray-400">
                    {r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString("fr-FR") : ""}
                  </span>
                </div>
                {r.rejectReason && (
                  <p className="text-xs text-gray-500 mt-1">Motif : {r.rejectReason}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nouvelle demande */}
      {unlinkableChurches.length > 0 && (
        <ProfileClient churches={unlinkableChurches} />
      )}
    </div>
  );
}
