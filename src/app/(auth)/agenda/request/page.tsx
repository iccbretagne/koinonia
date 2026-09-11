import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-classes";
import RequestForm from "./RequestForm";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente",
  VALIDATED: "Validée",
  SCHEDULED: "Planifiée",
  REJECTED: "Refusée",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  VALIDATED: "bg-blue-100 text-blue-800",
  SCHEDULED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-700",
};

export default async function AgendaRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; new?: string }>;
}) {
  const session = await requireAuth();
  const { from, new: isNew } = await searchParams;
  const fromRequests = from === "requests";
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  // Aligné sur « Mes demandes » : la liste d'abord, le formulaire sur demande explicite.
  const showForm = fromRequests || isNew === "1";

  if (!showForm) {
    const requests = await prisma.appointmentRequest.findMany({
      where: { churchId, userId: session.user.id },
      select: { id: true, subject: true, status: true, preferredDays: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    return (
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Mes demandes de RDV</h1>
          <Link href="/agenda/request?new=1" className={buttonClasses("primary")}>
            + Nouvelle demande
          </Link>
        </div>

        {requests.length === 0 ? (
          <div className="text-center py-12 text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
            <p className="text-lg">Aucune demande de rendez-vous.</p>
            <p className="text-sm mt-1">
              Cliquez sur &quot;+ Nouvelle demande&quot; pour solliciter un entretien pastoral.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{r.subject}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {r.createdAt.toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {r.preferredDays && <> · {r.preferredDays}</>}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
                      STATUS_COLOR[r.status] ?? "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const [church, memberLink] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId }, select: { name: true } }),
    prisma.memberUserLink.findUnique({
      where: { userId_churchId: { userId: session.user.id, churchId } },
      select: {
        validatedAt: true,
        member: {
          select: {
            departments: { include: { department: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  const isStar = memberLink?.validatedAt ? "Oui" : "";
  const department = isStar
    ? memberLink!.member.departments.map((d) => d.department.name).join(", ")
    : "";

  // Retour vers l'écran d'où l'on vient : le choix « Nouvelle demande », ou la liste des RDV.
  const backHref = fromRequests ? "/requests/new" : "/agenda/request";
  const backLabel = fromRequests ? "Nouvelle demande" : "Mes demandes de RDV";

  return (
    <div className="max-w-xl mx-auto">
      <Link
        href={backHref}
        className="text-sm text-gray-400 hover:text-icc-violet transition-colors mb-4 inline-block"
      >
        ← {backLabel}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Demande de RDV pastoral</h1>
      <p className="text-sm text-gray-500 mb-6">
        Soumettez votre demande. Un qualificateur la traitera et vous sera assigné un créneau.
      </p>
      <RequestForm
        churchId={churchId}
        churchName={church?.name ?? "votre église"}
        defaultFirstName={session.user.name?.split(" ")[0] ?? ""}
        defaultLastName={session.user.name?.split(" ").slice(1).join(" ") ?? ""}
        defaultEmail={session.user.email ?? ""}
        defaultIsStar={isStar}
        defaultDepartment={department}
        redirectTo={backHref}
        redirectLabel={backLabel}
      />
    </div>
  );
}
