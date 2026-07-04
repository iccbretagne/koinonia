import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import BackupsClient from "./BackupsClient";
import ConfigBackupClient from "./ConfigBackupClient";

export default async function BackupsPage() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) redirect("/admin");

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Sauvegardes</h1>
        <p className="text-sm text-gray-500 mb-6">Dump SQL complet de la base de données.</p>
        <BackupsClient />
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Configuration structurelle</h2>
        <p className="text-sm text-gray-500 mb-6">
          Export et restauration partielle des données de configuration (églises, ministères,
          départements, membres, liaisons).
        </p>
        <ConfigBackupClient />
      </div>
    </div>
  );
}
