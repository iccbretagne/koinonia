import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, CalendarHeart, Plus } from "lucide-react";
import { EmptyState, PageHeader, StatusChip, buttonClasses, type StatusTone } from "@/components/ui";
import RequestForm from "./RequestForm";
import { paths } from "@/lib/paths";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente",
  VALIDATED: "Confiée",
  SCHEDULED: "Planifiée",
  CLOSED: "Terminée",
  REJECTED: "Refusée",
};

const STATUS_TONE: Record<string, StatusTone> = {
  PENDING: "warning",
  VALIDATED: "info",
  SCHEDULED: "success",
  CLOSED: "neutral",
  REJECTED: "danger",
};

/**
 * Dépôt d'une demande de rendez-vous pastoral depuis son compte (ex-`/agenda/request`, spec
 * 052). Plus de jour préféré (retiré du dépôt, colonne conservée sans être lue ni écrite).
 */
export default async function CareRequestPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ from?: string; new?: string }>;
}) {
  const session = await requireAuth();
  const { from, new: isNew } = await searchParams;
  const fromRequests = from === "requests";
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-sm text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  // Aligné sur « Mes demandes » : la liste d'abord, le formulaire sur demande explicite.
  const showForm = fromRequests || isNew === "1";

  if (!showForm) {
    const requests = await prisma.appointmentRequest.findMany({
      where: { churchId, userId: session.user.id },
      select: { id: true, subject: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <PageHeader
          title="Mes demandes de RDV"
          actions={
            <Link href={paths.care.request({ new: "1" })} className={buttonClasses("primary")}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Demander un rendez-vous
            </Link>
          }
        />

        {requests.length === 0 ? (
          <EmptyState
            icon={CalendarHeart}
            title="Aucune demande de rendez-vous"
            description="Demandez un rendez-vous pour solliciter un entretien pastoral."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((r) => (
              <li key={r.id} className="rounded-card border border-line bg-surface px-4 py-3 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{r.subject}</p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {r.createdAt.toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <StatusChip tone={STATUS_TONE[r.status] ?? "neutral"} className="shrink-0">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </StatusChip>
                </div>
              </li>
            ))}
          </ul>
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
  const backHref = fromRequests ? paths.requests.newRequest() : paths.care.request();
  const backLabel = fromRequests ? "Nouvelle demande" : "Mes demandes de RDV";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Link href={backHref} className={`${buttonClasses("ghost", "sm")} self-start`}>
        <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
        Retour à « {backLabel} »
      </Link>
      <PageHeader
        title="Demande de RDV pastoral"
        description="Envoyez votre demande : elle sera étudiée puis confiée à un référent qui vous accompagnera."
      />
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
