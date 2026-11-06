import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { qrPath } from "@/lib/qr";
import { Alert } from "@/components/ui";
import PublicShell from "@/components/ticketing/PublicShell";
import QrSvg from "@/components/ticketing/QrSvg";
import { formatDateTime } from "@/components/ticketing/format";
import { getTicket } from "@/modules/ticketing";
import { AGE_GROUP_LABEL } from "@/modules/ticketing/schemas";

export const metadata: Metadata = { title: "Billet", robots: { index: false, follow: false } };

/** Billet individuel (spec 074) : ce billet seul, à présenter à l'entrée. Aucune modification possible. */
export default async function TicketPage({ params }: { readonly params: Promise<{ token: string }> }) {
  const { token } = await params;
  await connection();
  const ticket = await getTicket(token).catch(() => null);
  if (!ticket) notFound();

  return (
    <PublicShell eyebrow={ticket.event.churchName} title={ticket.event.title} subtitle={formatDateTime(ticket.event.startsAt)}>
      <div className="flex flex-col items-center gap-4 rounded-card border border-line bg-surface p-6 text-center">
        {ticket.valid ? (
          <QrSvg qr={qrPath(ticket.qr)} label={`Billet de ${ticket.firstName} ${ticket.lastName}`} className="size-64" />
        ) : (
          <Alert tone="danger" title="Billet annulé.">Ce billet n&apos;est plus valable.</Alert>
        )}
        <div>
          <p className="text-2xl font-bold text-ink">
            {ticket.firstName} {ticket.lastName}
          </p>
          <p className="text-[15px] text-ink-muted">
            {AGE_GROUP_LABEL[ticket.ageGroup]} · Réservation {ticket.reference}
          </p>
          {ticket.event.location && <p className="mt-2 text-[15px] text-ink">{ticket.event.location}</p>}
        </div>
        <p className="text-[13px] text-ink-subtle">Présentez ce code à l&apos;entrée, sur votre téléphone ou imprimé.</p>
      </div>
    </PublicShell>
  );
}
