import { requireSuperAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import OnboardClient from "./OnboardClient";

export default async function OnboardPage() {
  await requireSuperAdmin();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nouvelle église" description="Créez une nouvelle église et assignez un administrateur." />
      <OnboardClient />
    </div>
  );
}
