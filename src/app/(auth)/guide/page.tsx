import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import GuideContent from "@/components/GuideContent";
import type { Role } from "@prisma/client";

export default async function GuidePage() {
  const session = await requireAuth();
  const currentChurchId = await getCurrentChurchId(session);

  const currentRole: Role = session.user.churchRoles.find(
    (r) => r.churchId === currentChurchId
  )?.role ?? "DEPARTMENT_HEAD";

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Guide des fonctionnalités</h1>
      <p className="text-gray-600 mb-8">
        Découvrez les fonctionnalités disponibles selon votre rôle. Sélectionnez un profil pour voir ses accès.
      </p>
      <GuideContent defaultRole={currentRole} />
    </div>
  );
}
