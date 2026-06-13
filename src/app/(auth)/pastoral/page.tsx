import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function PastoralDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!session.user.pastoralProfileId) redirect("/dashboard");

  const profile = await prisma.pastoralProfile.findUnique({
    where: { id: session.user.pastoralProfileId },
    select: {
      id: true,
      role: true,
      name: true,
      church: { select: { id: true, name: true } },
      responsibleForChurch: {
        select: {
          id: true,
          name: true,
          supervisor: { select: { id: true, name: true, displayName: true } },
        },
      },
    },
  });

  if (!profile) redirect("/dashboard");

  // Églises supervisées par cet utilisateur
  const supervisedChurches = await prisma.church.findMany({
    where: { supervisorUserId: session.user.id },
    select: {
      id: true,
      name: true,
      responsible: { select: { id: true, name: true, role: true } },
    },
  });

  const roleLabel: Record<string, string> = {
    PASTEUR: "Pasteur",
    ASSISTANT_PASTEUR: "Assistant pasteur",
    BERGER: "Berger",
  };

  const allChurches = [
    ...(profile.responsibleForChurch ? [profile.responsibleForChurch] : []),
    ...supervisedChurches.filter((c) => c.id !== profile.responsibleForChurch?.id),
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bonjour, {session.user.displayName ?? session.user.name}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {roleLabel[profile.role]} · {profile.church.name}
        </p>
      </div>

      {allChurches.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Mes églises</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {allChurches.map((church) => (
              <div
                key={church.id}
                className="border-2 border-gray-200 rounded-lg p-4 space-y-1"
              >
                <p className="font-semibold text-gray-900">{church.name}</p>
                {"responsible" in church && church.responsible && (
                  <p className="text-sm text-gray-500">
                    Responsable : {church.responsible.name}{" "}
                    <span className="text-gray-400">
                      ({roleLabel[church.responsible.role]})
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Mon agenda pastoral</h2>
        <a
          href={`/agenda/${profile.id}`}
          className="inline-flex items-center gap-2 px-4 py-2 border-2 border-icc-violet text-icc-violet rounded-lg font-medium hover:bg-icc-violet hover:text-white transition-colors"
        >
          Voir mon agenda
        </a>
      </section>
    </div>
  );
}
