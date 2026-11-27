import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireAgendaManage } from "@/modules/agenda/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Alert, PageHeader, buttonClasses } from "@/components/ui";
import NewEntryForm from "./NewEntryForm";

export default async function NewAgendaEntryPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-sm text-ink-muted">Aucune église sélectionnée.</p>;
  await requireAgendaManage(churchId);

  const profiles = await prisma.pastoralProfile.findMany({
    where: { churchId },
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  if (profiles.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <PageHeader title="Ajouter à l'agenda pastoral" />
        <Alert
          tone="warning"
          title="Aucun profil pastoral configuré"
          action={
            <Link href="/admin/pastoral-profiles" className={`${buttonClasses("secondary", "sm")} min-h-11 sm:min-h-9`}>
              Configurer les profils
            </Link>
          }
        >
          Une entrée d&apos;agenda est toujours inscrite dans l&apos;agenda d&apos;un profil pastoral.
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader
        title="Ajouter à l'agenda pastoral"
        description="Une activité ou un rendez-vous inscrit directement dans l'agenda d'un pasteur, sans passer par une demande de rendez-vous."
      />
      <NewEntryForm churchId={churchId} profiles={profiles} />
    </div>
  );
}
