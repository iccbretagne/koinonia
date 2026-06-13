import { auth, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import PastoralMembersClient from "./PastoralMembersClient";

export default async function PastoralMembersPage() {
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
    select: { id: true, churchId: true, responsibleForChurch: { select: { id: true } } },
  });

  // Église supervisée : utiliser le profil superviseur
  if (!profile && currentChurchId) {
    profile = await prisma.pastoralProfile.findFirst({
      where: {
        userId: session.user.id,
        supervisorForChurches: { some: { id: currentChurchId } },
      },
      select: { id: true, churchId: true, responsibleForChurch: { select: { id: true } } },
    });
  }
  if (!profile) redirect("/pastoral");

  // L'église active est l'église courante du contexte (ChurchSwitcher)
  const activeChurchId = currentChurchId
    ?? profile.responsibleForChurch?.id
    ?? profile.churchId;

  const [churchData, members] = await Promise.all([
    prisma.church.findUnique({
      where: { id: activeChurchId },
      select: { name: true },
    }),
    prisma.member.findMany({
      where: {
        departments: { some: { department: { ministry: { churchId: activeChurchId } } } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        departments: {
          where: { isPrimary: true },
          select: { department: { select: { name: true, ministry: { select: { name: true } } } } },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  return (
    <PastoralMembersClient
      members={members}
      churchName={churchData?.name ?? ""}
    />
  );
}
