import { redirect, notFound } from "next/navigation";
import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { getAccessibleAudioTabs } from "./tabs";

/** `/audio` redirige vers le premier onglet accessible (spec 021). */
export default async function AudioIndexPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);

  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  const tabs = await getAccessibleAudioTabs(churchId);
  const first = tabs[0];
  if (!first) notFound();

  redirect(first.href);
}
