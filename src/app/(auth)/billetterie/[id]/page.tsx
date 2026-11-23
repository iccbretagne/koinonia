import { ticketingSitesEnabled } from "@/lib/ticketing-sites-flag";
import { notFound } from "next/navigation";
import { hasChurchPermission, requireAuth } from "@/lib/auth";
import { qrPath } from "@/lib/qr";
import Link from "next/link";
import { ScanLine, Utensils } from "lucide-react";
import { PageHeader, StatusChip, Tabs } from "@/components/ui";
import { buttonClasses } from "@/components/ui/button-classes";
import { dateAndPlace } from "@/components/ticketing/format";
import {
  getTicketVisual,
  listTicketImages,
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
  getDomain,
  getSite,
  getSiteStatus,
  previewEvent,
} from "@/modules/ticketing";
import { EVENT_STATUS_LABEL } from "@/modules/ticketing/schemas";
import TicketVisualTab from "./_components/TicketVisualTab";
import Overview from "./_components/Overview";
import SettingsTab from "./_components/SettingsTab";
import OptionsTab from "./_components/OptionsTab";
import BookingsTab from "./_components/BookingsTab";
import PaymentsTab from "./_components/PaymentsTab";
import TeamTab from "./_components/TeamTab";
import StaffSection from "./_components/StaffSection";
import SiteTab from "./_components/SiteTab";
import PresenceTab from "./_components/PresenceTab";
import CateringTab from "./_components/CateringTab";
import EventFormsBlock from "@/components/forms/EventFormsBlock";
import { registry } from "@/lib/registry";

const VIEWS = ["apercu", "parametres", "options", "inscrits", "reglements", "equipe", "presences", "restauration", "site", "billet"] as const;
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
  // Communication (spec 084) : pas de `read`, seulement l'aperçu allégé et l'onglet Site.
  const read = canDo(access, "read");
  // Sites d'événement : drapeau d'instance (coupé par défaut).
  const siteAccess = canDo(access, "site") && ticketingSitesEnabled();
  if (!read && !siteAccess) return <p className="p-4 text-ink-muted">Accès non autorisé.</p>;

  const can = {
    configure: canDo(access, "configure"),
    payments: canDo(access, "payments"),
    reception: canDo(access, "reception"),
    catering: canDo(access, "catering"),
    bookings: ["ORGANIZER", "TREASURER", "OBSERVER"].some((r) => access.roles.has(r as never)),
    site: siteAccess,
  };
  const allowed: Record<View, boolean> = {
    apercu: true,
    parametres: can.configure,
    options: can.configure,
    inscrits: can.bookings,
    reglements: can.payments,
    equipe: can.configure,
    presences: read,
    restauration: can.catering,
    site: can.site,
    billet: read,
  };
  const requested = VIEWS.find((v) => v === query.vue);
  const view: View = requested && allowed[requested] ? requested : "apercu";

  if (!read) return <RestrictedEvent id={id} view={view} />;

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
  // Formulaires rattachés (spec 079, lot 3).
  const visual = view === "billet" ? await getTicketVisual(id) : null;
  const ticketImages = view === "billet" ? await listTicketImages(id) : [];
  const site = view === "site" ? await getSite(id) : null;
  const sitePreview = view === "site" ? await previewEvent(id) : null;
  const siteStatus = view === "site" ? await getSiteStatus(id) : null;
  const domain = view === "site" && can.configure ? await getDomain(id) : null;
  const forms = view === "apercu" && registry.has("forms") ? await (await import("@/modules/forms")).listFormsForEvent({ ticketingEventId: id }) : [];
  const formsManager = forms.length > 0 && (await hasChurchPermission(session, "forms:manage", access.churchId));
  const publicUrl = `${appUrl()}/inscription/${event.church.slug}/${event.slug}`;
  const pending = payments.filter((p) => p.kind === "DECLARATION" && p.status === "PENDING").length;
  const tabs = VIEWS.filter((v) => allowed[v]).map((v) => ({
    href: `/billetterie/${id}?vue=${v}`,
    label: { apercu: "Aperçu", parametres: "Paramètres", options: "Options", inscrits: "Inscrits", reglements: "Règlements", equipe: "Équipe", presences: "Présences", restauration: "Restauration", site: "Site", billet: "Visuel du billet" }[v],
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
      {view === "apercu" && <EventFormsBlock forms={forms} manage={formsManager} />}
      {view === "apercu" && <Overview event={event} bookings={bookings} publicUrl={publicUrl} publicQr={qrPath(publicUrl)} canConfigure={can.configure} />}
      {view === "billet" && visual && <TicketVisualTab eventId={id} initial={visual} images={ticketImages} canEdit={can.configure} />}
      {view === "parametres" && <SettingsTab event={event} />}
      {view === "options" && <OptionsTab event={event} />}
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
      {view === "site" && site && (
        <SiteTab eventId={id} site={site} event={sitePreview} title={event.title} churchSlug={event.church.slug ?? ""} eventSlug={event.slug} publicUrl={siteStatus?.url ?? null} warnings={siteStatus?.warnings ?? []} canConfigure={can.configure} domain={domain} />
      )}
    </div>
  );
}

/**
 * Vue du rôle Communication (spec 084) : aperçu sans chiffres d'inscription ni coordonnées, et
 * onglet Site. Seules des données publiques de l'événement sont lues.
 */
async function RestrictedEvent({ id, view }: { readonly id: string; readonly view: View }) {
  const event = await previewEvent(id);
  if (!event) notFound();
  const tabs = [
    { href: `/billetterie/${id}?vue=apercu`, label: "Aperçu", active: view !== "site" },
    { href: `/billetterie/${id}?vue=site`, label: "Site", active: view === "site" },
  ];
  const site = view === "site" ? await getSite(id) : null;
  const siteStatus = view === "site" ? await getSiteStatus(id) : null;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Billetterie" title={event.title} description={dateAndPlace(event.startsAt, event.location)} actions={<StatusChip tone={event.status === "OPEN" ? "success" : "neutral"}>{EVENT_STATUS_LABEL[event.status]}</StatusChip>}>
        <Tabs tabs={tabs} ariaLabel="Événement" />
      </PageHeader>
      {view === "site" && site ? (
        <SiteTab eventId={id} site={site} event={event} title={event.title} churchSlug={event.churchSlug} eventSlug={event.slug} publicUrl={siteStatus?.url ?? null} warnings={siteStatus?.warnings ?? []} />
      ) : (
        <div className="space-y-2 rounded-card border border-line bg-surface p-4">
          <p className="text-[15px] text-ink">Page d&apos;inscription : <span className="break-all text-ink-muted">{`${appUrl()}/inscription/${event.churchSlug}/${event.slug}`}</span></p>
          {event.description && <p className="whitespace-pre-line text-[15px] text-ink-muted">{event.description}</p>}
        </div>
      )}
    </div>
  );
}
