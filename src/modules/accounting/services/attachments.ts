import type { Session } from "next-auth";
import type { PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";

type PrismaClientOrTx = Pick<PrismaClient, "financialAttachment">;

/**
 * Vérifie que chaque pièce désignée peut être rattachée à une nouvelle demande : déposée par
 * l'appelant, encore orpheline, dans son église. Toute divergence lève la même erreur — ne
 * jamais révéler laquelle des conditions a échoué (spec 025).
 *
 * Accepte un client de transaction (`tx`) pour que cette vérification et le rattachement qui
 * la suit s'exécutent atomiquement — sans quoi une suppression concurrente entre les deux
 * pourrait laisser passer un rattachement partiel. Le client par défaut n'est importé qu'à
 * l'appel (import différé) pour ne pas construire le client Prisma réel au simple chargement
 * du module — voir le motif équivalent dans `src/lib/auth.ts`.
 */
export async function assertAttachmentsAssignable(
  attachmentIds: string[],
  params: { userId: string; churchId: string },
  client?: PrismaClientOrTx
): Promise<void> {
  const uniqueIds = Array.from(new Set(attachmentIds));
  if (uniqueIds.length === 0) return;

  const db = client ?? (await import("@/lib/prisma")).prisma;
  const count = await db.financialAttachment.count({
    where: {
      id: { in: uniqueIds },
      uploadedById: params.userId,
      requestId: null,
      churchId: params.churchId,
    },
  });

  if (count !== uniqueIds.length) {
    throw new ApiError(403, "Pièce jointe invalide");
  }
}

/**
 * Autorise la lecture d'une pièce déposée par quelqu'un d'autre : réservée au traitement
 * comptable (accounting:manage) dans l'église de la pièce — pas à la simple soumission.
 * L'église de la pièce fait autorité, jamais un contexte affiché.
 */
export async function canReadAttachment(
  attachment: { uploadedById: string | null; churchId: string },
  session: Session
): Promise<boolean> {
  if (attachment.uploadedById && attachment.uploadedById === session.user.id) return true;
  if (session.user.isSuperAdmin) return true;

  const { rolePermissions } = await import("@/lib/registry");
  const roles = session.user.churchRoles.filter((r) => r.churchId === attachment.churchId);
  const permissions = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));

  return permissions.has("accounting:manage");
}
