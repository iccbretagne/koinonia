import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { registry } from "@/lib/registry";
import Reservations from "./_reservations/Reservations";
import Responses from "./_formulaires/Responses";

/**
 * « Mes inscriptions » (spec 092, lot 4) : réservations de billetterie (`?vue=reservations`, par
 * défaut) et réponses à des formulaires (`?vue=formulaires`) du compte connecté, en un seul
 * écran. Page du noyau : un module coupé ne montre pas sa vue ; les deux coupés ⇒ 404. Chaque
 * vue ne lit que les données du compte (`session.user.id`).
 */
export default async function MyRegistrationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ vue?: string }>;
}) {
  await requireAuth();
  const ticketing = registry.has("ticketing");
  const forms = registry.has("forms");
  if (!ticketing && !forms) notFound();

  const { vue } = await searchParams;
  const view = (vue === "formulaires" && forms) || !ticketing ? "formulaires" : "reservations";
  return view === "reservations" ? <Reservations /> : <Responses />;
}
