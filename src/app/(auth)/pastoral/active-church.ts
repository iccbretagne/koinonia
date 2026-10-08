import { redirect } from "next/navigation";
import { auth, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PROFILE_SELECT = { id: true, churchId: true, responsibleForChurch: { select: { id: true } } } as const;

/**
 * Garde des sous-pages de l'espace pastoral : un profil pastoral dans l'église courante
 * (direct, ou superviseur de cette église), sinon redirection. Renvoie l'église active : celle
 * du contexte (ChurchSwitcher), à défaut celle dont le profil est responsable, puis la sienne.
 */
export async function requirePastoralActiveChurch() {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!(session.user.pastoralChurchIds ?? []).length) redirect("/dashboard");

  const currentChurchId = await getCurrentChurchId(session);

  // Profil direct dans l'église courante
  let profile = await prisma.pastoralProfile.findFirst({
    where: {
      userId: session.user.id,
      ...(currentChurchId ? { churchId: currentChurchId } : {}),
    },
    select: PROFILE_SELECT,
  });

  // Église supervisée : utiliser le profil superviseur
  if (!profile && currentChurchId) {
    profile = await prisma.pastoralProfile.findFirst({
      where: { userId: session.user.id, supervisorForChurches: { some: { id: currentChurchId } } },
      select: PROFILE_SELECT,
    });
  }
  if (!profile) redirect("/pastoral");

  const activeChurchId = currentChurchId ?? profile.responsibleForChurch?.id ?? profile.churchId;
  return { session, activeChurchId };
}
