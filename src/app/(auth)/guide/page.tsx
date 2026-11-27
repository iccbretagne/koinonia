import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import GuideContent from "@/components/GuideContent";
import type { Role } from "@/generated/prisma/client";
import PageHeader from "@/components/ui/PageHeader";

export default async function GuidePage() {
  const session = await requireAuth();
  const currentChurchId = await getCurrentChurchId(session);

  const currentRole: Role = session.user.churchRoles.find(
    (r) => r.churchId === currentChurchId
  )?.role ?? "DEPARTMENT_HEAD";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Guide des fonctionnalités"
        description="Découvrez les fonctionnalités disponibles selon votre rôle. Sélectionnez un profil pour voir ses accès."
      />
      <GuideContent defaultRole={currentRole} />
    </div>
  );
}
