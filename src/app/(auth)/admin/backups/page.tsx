import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import BackupsClient from "./BackupsClient";

export default async function BackupsPage() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) redirect("/admin");

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Sauvegardes</h1>
      <BackupsClient />
    </div>
  );
}
