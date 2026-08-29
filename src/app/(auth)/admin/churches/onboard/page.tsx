import { requireSuperAdmin } from "@/lib/auth";
import OnboardClient from "./OnboardClient";

export default async function OnboardPage() {
  await requireSuperAdmin();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Nouvelle église
      </h1>
      <OnboardClient />
    </div>
  );
}
