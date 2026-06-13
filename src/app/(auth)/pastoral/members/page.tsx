import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<{ church?: string }>;
}

export default async function PastoralMembersPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!session.user.pastoralProfileId) redirect("/dashboard");

  const { church: churchFilter } = await searchParams;

  const profile = await prisma.pastoralProfile.findUnique({
    where: { id: session.user.pastoralProfileId },
    select: {
      churchId: true,
      responsibleForChurch: { select: { id: true, name: true } },
    },
  });
  if (!profile) redirect("/pastoral");

  const supervisedChurches = await prisma.church.findMany({
    where: { supervisorUserId: session.user.id },
    select: { id: true, name: true },
  });

  const allChurches = [
    ...(profile.responsibleForChurch ? [profile.responsibleForChurch] : []),
    ...supervisedChurches.filter((c) => c.id !== profile.responsibleForChurch?.id),
  ];
  const fallbackChurchId = profile.responsibleForChurch?.id ?? profile.churchId;
  const activeChurchId = (churchFilter && allChurches.some((c) => c.id === churchFilter))
    ? churchFilter
    : fallbackChurchId;

  const members = await prisma.member.findMany({
    where: {
      departments: { some: { department: { ministry: { churchId: activeChurchId } } } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      departments: {
        where: { isPrimary: true },
        select: { department: { select: { name: true, ministry: { select: { name: true } } } } },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const activeChurchName = allChurches.find((c) => c.id === activeChurchId)?.name ?? "";

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mes membres</h1>
          {activeChurchName && (
            <p className="text-sm text-gray-500 mt-0.5">{activeChurchName}</p>
          )}
        </div>

        {allChurches.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {allChurches.map((church) => (
              <a
                key={church.id}
                href={`/pastoral/members?church=${church.id}`}
                className={`px-3 py-1.5 text-sm rounded-full border-2 transition-colors ${
                  church.id === activeChurchId
                    ? "border-icc-violet bg-icc-violet text-white"
                    : "border-gray-200 text-gray-600 hover:border-icc-violet"
                }`}
              >
                {church.name}
              </a>
            ))}
          </div>
        )}
      </div>

      {members.length === 0 ? (
        <p className="text-gray-400 italic text-sm">Aucun membre trouvé.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {members.map((member) => {
            const dept = member.departments[0]?.department;
            return (
              <div key={member.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-icc-violet/10 text-icc-violet flex items-center justify-center text-sm font-semibold shrink-0">
                  {member.firstName[0]}{member.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {member.firstName} {member.lastName}
                  </p>
                  {dept && (
                    <p className="text-xs text-gray-400 truncate">
                      {dept.ministry.name} · {dept.name}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {member.email && (
                    <a href={`mailto:${member.email}`} className="text-gray-400 hover:text-icc-violet transition-colors" title={member.email}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </a>
                  )}
                  {member.phone && (
                    <a href={`tel:${member.phone}`} className="text-gray-400 hover:text-icc-violet transition-colors" title={member.phone}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400">
        {members.length} membre{members.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
