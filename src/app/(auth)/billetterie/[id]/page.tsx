import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { qrPath } from "@/lib/qr";
import Link from "next/link";
import { ScanLine, Utensils } from "lucide-react";
import { PageHeader, StatusChip, Tabs } from "@/components/ui";
import { buttonClasses } from "@/components/ui/button-classes";
import { dateAndPlace } from "@/components/ticketing/format";
import {
  canDo,
  getEventAccess,
  getEventDetail,
  cateringBoard,
  getPresence,
  listBookings,
  listTeam,
  listChurchAccounts,
  listChurchDepartments,
  listPayments,
} from "@/modules/ticketing";
import { EVENT_STATUS_LABEL } from "@/modules/ticketing/schemas";
import Overview from "./_components/Overview";
import SettingsTab from "./_components/SettingsTab";
import BookingsTab from "./_components/BookingsTab";
import PaymentsTab from "./_components/PaymentsTab";
import TeamTab from "./_components/TeamTab";
import StaffSection from "./_components/StaffSection";
import PresenceTab from "./_components/PresenceTab";
import CateringTab from "./_components/CateringTab";

const VIEWS = ["apercu", "parametres", "inscrits", "reglements", "equipe", "presences", "restauration"] as const;
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
    presences: true,
    restauration: can.catering,
  };
  const requested = VIEWS.find((v) => v === query.vue);
  const view: View = requested && allowed[requested] ? requested : "apercu";

  const [event, bookings, payments, accounts, departments, team, presence, board] = await Promise.all([
    getEventDetail(id),
    can.bookings ? listBookings(id, can.payments) : Promise.resolve(null),
    can.payments ? listPayments(id) : Promise.resolve([]),
    can.configure && view === "equipe" ? listChurchAccounts(access.churchId) : Promise.resolve([]),
    can.configure && view === "equipe" ? listChurchDepartments(access.churchId) : Promise.resolve([]),
    can.configure && view === "equipe" ? listTeam(id) : Promise.resolve(null),
    view === "presences" ? getPresence(id) : Promise.resolve(null),
    view === "restauration" ? cateringBoard(id) : Promise.resolve(null),
  ]);
  const publicUrl = `${appUrl()}/inscription/${event.church.slug}/${event.slug}`;
  const pending = payments.filter((p) => p.kind === "DECLARATION" && p.status === "PENDING").length;
  const tabs = VIEWS.filter((v) => allowed[v]).map((v) => ({
    href: `/billetterie/${id}?vue=${v}`,
    label: { apercu: "Aperçu", parametres: "Paramètres", inscrits: "Inscrits", reglements: "Règlements", equipe: "Équipe", presences: "Présences", restauration: "Restauration" }[v],
    active: v === view,
    count: v === "reglements" && pending > 0 ? pending : undefined,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billetterie"
        title={event.title}
        description={dateAndPlace(event.startsAt, event.location)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={event.status === "OPEN" ? "success" : "neutral"}>{EVENT_STATUS_LABEL[event.status]}</StatusChip>
            {can.reception && (
              <Link href={`/billetterie/${id}/controle`} className={buttonClasses("primary", "sm")}>
                <ScanLine className="size-4" aria-hidden="true" /> Contrôle
              </Link>
            )}
            {can.catering && event.options.some((o) => o.pickup) && (
              <Link href={`/billetterie/${id}/restauration`} className={buttonClasses("secondary", "sm")}>
                <Utensils className="size-4" aria-hidden="true" /> Restauration
              </Link>
            )}
          </div>
        }
      >
        <Tabs tabs={tabs} ariaLabel="Événement" />
      </PageHeader>
      {view === "apercu" && <Overview event={event} bookings={bookings} publicUrl={publicUrl} publicQr={qrPath(publicUrl)} />}
      {view === "parametres" && <SettingsTab event={event} />}
      {view === "inscrits" && bookings && <BookingsTab eventId={id} bookings={bookings} canManage={can.payments} questions={event.questions} />}
      {view === "reglements" && bookings && <PaymentsTab eventId={id} bookings={bookings} payments={payments} />}
      {view === "equipe" && (
        <div className="space-y-8">
          <TeamTab eventId={id} roles={event.roles} accounts={accounts} />
          {team && <StaffSection eventId={id} team={team} accounts={accounts} departments={departments} />}
        </div>
      )}
      {view === "presences" && presence && <PresenceTab eventId={id} presence={presence} canExport={can.reception} />}
      {view === "restauration" && board && <CateringTab board={board} />}
    </div>
  );
}
