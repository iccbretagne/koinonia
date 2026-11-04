import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { qrPath } from "@/lib/qr";
import { PageHeader, StatusChip, Tabs } from "@/components/ui";
import { formatDateTime } from "@/components/ticketing/format";
import {
  canDo,
  getEventAccess,
  getEventDetail,
  listBookings,
  listChurchAccounts,
  listPayments,
} from "@/modules/ticketing";
import { EVENT_STATUS_LABEL } from "@/modules/ticketing/schemas";
import Overview from "./_components/Overview";
import SettingsTab from "./_components/SettingsTab";
import BookingsTab from "./_components/BookingsTab";
import PaymentsTab from "./_components/PaymentsTab";
import TeamTab from "./_components/TeamTab";

const VIEWS = ["apercu", "parametres", "inscrits", "reglements", "equipe"] as const;
type View = (typeof VIEWS)[number];

function appUrl() {
  return process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

/** Tableau de bord d'un événement de billetterie (spec 074), onglets selon les rôles. */
export default async function TicketingEventPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireAuth();
  const access = await getEventAccess(session, id).catch(() => null);
  if (!access) notFound();
  if (!canDo(access, "read")) return <p className="p-4 text-ink-muted">Accès non autorisé.</p>;

  const can = {
    configure: canDo(access, "configure"),
    payments: canDo(access, "payments"),
    reception: canDo(access, "reception"),
    catering: canDo(access, "catering"),
    bookings: ["ORGANIZER", "TREASURER", "OBSERVER"].some((r) => access.roles.has(r as never)),
  };
  const allowed: Record<View, boolean> = {
    apercu: true,
    parametres: can.configure,
    inscrits: can.bookings,
    reglements: can.payments,
    equipe: can.configure,
  };
  const requested = VIEWS.find((v) => v === query.vue);
  const view: View = requested && allowed[requested] ? requested : "apercu";

  const [event, bookings, payments, accounts] = await Promise.all([
    getEventDetail(id),
    can.bookings ? listBookings(id, can.payments) : Promise.resolve(null),
    can.payments ? listPayments(id) : Promise.resolve([]),
    can.configure && view === "equipe" ? listChurchAccounts(access.churchId) : Promise.resolve([]),
  ]);
  const publicUrl = `${appUrl()}/inscription/${event.church.slug}/${event.slug}`;
  const pending = payments.filter((p) => p.kind === "DECLARATION" && p.status === "PENDING").length;
  const tabs = VIEWS.filter((v) => allowed[v]).map((v) => ({
    href: `/billetterie/${id}?vue=${v}`,
    label: { apercu: "Aperçu", parametres: "Paramètres", inscrits: "Inscrits", reglements: "Règlements", equipe: "Équipe" }[v],
    active: v === view,
    count: v === "reglements" && pending > 0 ? pending : undefined,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billetterie"
        title={event.title}
        description={`${formatDateTime(event.startsAt)}${event.location ? ` · ${event.location}` : ""}`}
        actions={<StatusChip tone={event.status === "OPEN" ? "success" : "neutral"}>{EVENT_STATUS_LABEL[event.status]}</StatusChip>}
      >
        <Tabs tabs={tabs} ariaLabel="Événement" />
      </PageHeader>
      {view === "apercu" && <Overview event={event} bookings={bookings} publicUrl={publicUrl} publicQr={qrPath(publicUrl)} />}
      {view === "parametres" && <SettingsTab event={event} />}
      {view === "inscrits" && bookings && <BookingsTab eventId={id} bookings={bookings} canManage={can.payments} questions={event.questions} />}
      {view === "reglements" && bookings && <PaymentsTab eventId={id} bookings={bookings} payments={payments} />}
      {view === "equipe" && <TeamTab eventId={id} roles={event.roles} accounts={accounts} />}
    </div>
  );
}
