import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { canDo, getEventAccess } from "@/modules/ticketing";
import ControlClient from "./ControlClient";

/** Écran de contrôle des entrées et sorties (spec 074, lot 2) : téléphone, utilisable hors ligne. */
export default async function ControlPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuth();
  const access = await getEventAccess(session, id).catch(() => null);
  if (!access) notFound();
  if (!canDo(access, "reception")) return <p className="p-4 text-ink-muted">Réservé à l&apos;accueil et à l&apos;organisation.</p>;
  return <ControlClient eventId={id} />;
}
