import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { canDo, getEventAccess, getEventDetail } from "@/modules/ticketing";
import CateringClient from "./CateringClient";

/** Écran de la restauration (spec 074, lot 3) : distribution hors ligne, menu, stock. */
export default async function CateringPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuth();
  const access = await getEventAccess(session, id).catch(() => null);
  if (!access) notFound();
  if (!canDo(access, "catering")) return <p className="p-4 text-ink-muted">Réservé à la restauration et à l&apos;organisation.</p>;
  const event = await getEventDetail(id);
  const menus = event.options
    .filter((o) => o.pickup && o.type === "CHOICE")
    .map((o) => ({
      id: o.id,
      label: o.label,
      namedPrep: o.namedPrep,
      variants: o.variants.map((v) => ({
        id: v.id,
        label: v.label,
        description: v.description,
        allergens: v.allergens,
        stock: v.stock,
        prepared: v.prepared,
        closed: v.closed,
        used: v.used,
      })),
    }));
  const hasLabels = event.options.some((o) => o.namedPrep);
  return <CateringClient eventId={id} menus={menus} hasLabels={hasLabels} />;
}
