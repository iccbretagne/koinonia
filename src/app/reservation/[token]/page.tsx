import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { qrPath } from "@/lib/qr";
import PublicShell from "@/components/ticketing/PublicShell";
import { formatDateTime } from "@/components/ticketing/format";
import { bookingIdFromManageToken, getBookingView, getPublicEvent } from "@/modules/ticketing";
import ReservationClient from "./ReservationClient";

export const metadata: Metadata = { title: "Ma réservation", robots: { index: false, follow: false } };

/** « Ma réservation » (spec 074) : lien personnel secret, sans compte. */
export default async function ReservationPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ token: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  await connection();
  const view = await bookingIdFromManageToken(token)
    .then(getBookingView)
    .catch(() => null);
  if (!view) notFound();
  const publicEvent = view.can.editOptions || view.can.addParticipant ? await getPublicEvent(view.event.churchSlug, view.event.slug) : null;
  const qrs = {
    booking: qrPath(view.scanCode),
    tickets: Object.fromEntries(view.participants.filter((p) => p.ticketUrl).map((p) => [p.id, qrPath(p.ticketUrl!)])),
  };

  return (
    <PublicShell
      eyebrow={view.event.churchName}
      title={view.event.title}
      subtitle={`${formatDateTime(view.event.startsAt)}${view.event.location ? ` · ${view.event.location}` : ""}`}
    >
      <ReservationClient token={token} view={view} publicEvent={publicEvent} qrs={qrs} justCreated={query.nouvelle === "1"} />
    </PublicShell>
  );
}
