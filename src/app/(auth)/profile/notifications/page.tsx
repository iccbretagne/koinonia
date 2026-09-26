import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPreferencesView } from "@/lib/notification-preferences";
import NotificationPreferencesClient from "./NotificationPreferencesClient";
import JobSubscriptionClient from "./JobSubscriptionClient";

export default async function NotificationPreferencesPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const view = await getPreferencesView(session.user.id!);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Mes notifications</h1>
      <NotificationPreferencesClient initialView={view} />
      <JobSubscriptionClient />
    </div>
  );
}
