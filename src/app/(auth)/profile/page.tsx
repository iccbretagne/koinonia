import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { excludeChurchesAlreadyReached } from "@/lib/onboarding";
import ProfileClient from "./ProfileClient";
import JobSubscriptionClient from "./JobSubscriptionClient";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  // Liens STAR existants
  const links = await prisma.memberUserLink.findMany({
    where: { userId: session.user.id },
    include: {
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          departments: {
            where: { isPrimary: true },
            include: { department: { select: { name: true, ministry: { select: { name: true } } } } },
          },
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

  // Églises proposables pour une nouvelle demande : ni déjà liée, ni déjà un rôle, ni demande
  // en attente. Toutes les églises de la plateforme sont éligibles — pas seulement celles où
  // l'utilisateur a déjà un rôle (spec 037 : rejoindre une église où l'on n'a encore aucun pied
  // doit être possible, avec le même parcours que /no-access pour un utilisateur sans église).
  const reachedChurchIds = [
    ...links.map((l) => l.church.id),
    ...pendingRequests.map((r) => r.church.id),
    ...session.user.churchRoles.map((r) => r.churchId),
  ];

  const allChurches = await prisma.church.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const unlinkableChurches = excludeChurchesAlreadyReached(allChurches, reachedChurchIds);

  const ministries = await prisma.ministry.findMany({
    where: { isSystem: false },
    select: {
      id: true,
      name: true,
      churchId: true,
      departments: {
        where: { isSystem: false },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

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
                    {l.member.departments[0]?.department.ministry.name} / {l.member.departments[0]?.department.name}
                  </p>
                  {l.member.departments[0]?.department.name === "Sans département" && (
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

      {/* Abonnements Emploi */}
      <JobSubscriptionClient />

      {/* Nouvelle demande */}
      {unlinkableChurches.length > 0 && (
        <ProfileClient churches={unlinkableChurches} ministries={ministries} />
      )}
    </div>
  );
}
