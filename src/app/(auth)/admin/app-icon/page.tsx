import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { getAppIconState } from "@/modules/core";
import AppIconClient from "./AppIconClient";

/** Icône de l'application (spec 069) : réglage de plateforme, réservé au Super Admin. */
export default async function AppIconPage() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) redirect("/admin");
  const state = await getAppIconState();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administration · Plateforme"
        title="Icône de l'application"
        description="L'icône de l'écran d'accueil, de l'onglet du navigateur et des notifications, pour toutes les églises de l'instance."
      />
      <AppIconClient initialState={state} />
    </div>
  );
}
