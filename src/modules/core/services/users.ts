import { ApiError } from "@/lib/api-utils";

// Suppression réservée aux comptes pré-provisionnés jamais activés (spec 047) : un compte qui a
// déjà terminé une connexion Google, ou qui porte un rôle dans une autre église, ne peut pas être
// supprimé par ce geste — seul le retrait d'un compte préparé par erreur est couvert ici, pas la
// suppression d'un utilisateur en général (hors périmètre).
//
// Import dynamique de prisma (voir src/modules/audio/services/service.ts) : évite qu'importer
// l'index du module (@/modules/core), utilisé par des tests qui ne mockent pas prisma, instancie
// un vrai PrismaClient au chargement du fichier.
export async function deleteNeverConnectedUser(userId: string, churchId: string) {
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      accounts: { select: { id: true } },
      churchRoles: { select: { churchId: true } },
    },
  });
  if (!user) throw new ApiError(404, "Utilisateur introuvable");

  if (user.accounts.length > 0) {
    throw new ApiError(409, "Ce compte a déjà été activé, il ne peut pas être supprimé");
  }
  if (user.churchRoles.some((r) => r.churchId !== churchId)) {
    throw new ApiError(409, "Cet utilisateur a des rôles dans une autre église");
  }

  await prisma.$transaction(async (tx) => {
    await tx.userDepartment.deleteMany({ where: { userChurchRole: { userId } } });
    await tx.userChurchRole.deleteMany({ where: { userId } });
    await tx.memberUserLink.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });

  return user;
}
