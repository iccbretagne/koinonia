import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPreferencesView } from "@/lib/notification-preferences";
import NotificationPreferencesClient from "./NotificationPreferencesClient";
import JobSubscriptionClient from "./JobSubscriptionClient";
import PageHeader from "@/components/ui/PageHeader";

export default async function NotificationPreferencesPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const view = await getPreferencesView(session.user.id!);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        eyebrow="Mon profil"
        title="Mes notifications"
        description="Les notifications restent visibles dans l'application ; choisissez ce que vous recevez aussi par email."
      />
      <NotificationPreferencesClient initialView={view} />
      <JobSubscriptionClient />
    </div>
  );
}
