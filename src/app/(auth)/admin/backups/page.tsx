import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import BackupsClient from "./BackupsClient";
import ConfigBackupClient from "./ConfigBackupClient";
import { PageHeader } from "@/components/ui";

export default async function BackupsPage() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) redirect("/admin");

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <PageHeader title="Sauvegardes" description="Dump SQL complet de la base de données." />
        <BackupsClient />
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Configuration structurelle</h2>
          <p className="mt-1 text-[15px] leading-[22px] text-ink-muted">
            Export et restauration partielle des données de configuration (églises, ministères,
            départements, membres, liaisons).
          </p>
        </div>
        <ConfigBackupClient />
      </section>
    </div>
  );
}
