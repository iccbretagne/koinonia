import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { getTurnstileSiteKey } from "@/lib/turnstile";
import PublicFormUnavailable from "@/components/PublicFormUnavailable";
import PublicShell from "@/components/ticketing/PublicShell";
import { formatDateTime } from "@/components/ticketing/format";
import { getPublicEvent } from "@/modules/ticketing";
import BookingForm from "./BookingForm";

type Params = { readonly params: Promise<{ churchSlug: string; eventSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { churchSlug, eventSlug } = await params;
  const event = await getPublicEvent(churchSlug, eventSlug);
  return { title: event ? `${event.title} — Inscription` : "Inscription" };
}

/** Page publique d'inscription à un événement (spec 074), sans compte. */
export default async function RegistrationPage({ params }: Params) {
  const { churchSlug, eventSlug } = await params;
  await connection();
  const event = await getPublicEvent(churchSlug, eventSlug);
  if (!event) notFound();
  const siteKey = getTurnstileSiteKey();
  const session = await auth().catch(() => null);
  const prefill = session?.user ? { name: session.user.name ?? "", email: session.user.email ?? "" } : null;

  return (
    <PublicShell eyebrow={event.churchName} title={event.title} subtitle={`${formatDateTime(event.startsAt)}${event.location ? ` · ${event.location}` : ""}`}>
      <div className="space-y-6">
        {event.hasPoster && (
          // eslint-disable-next-line @next/next/no-img-element -- affiche servie par l'API publique, dimensions inconnues
          <img
            src={`/api/ticketing/public/${event.churchSlug}/${event.slug}/poster`}
            alt={`Affiche : ${event.title}`}
            className="w-full rounded-card border border-line"
          />
        )}
        {event.description && <p className="whitespace-pre-line text-[15px] leading-6 text-ink">{event.description}</p>}
        {siteKey ? (
          <BookingForm event={event} turnstileSiteKey={siteKey} prefill={prefill} />
        ) : (
          <PublicFormUnavailable churchName={event.churchName} />
        )}
      </div>
    </PublicShell>
  );
}
