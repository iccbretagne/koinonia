import type { Prisma } from "@/generated/prisma/client";

export type DbClient = Prisma.TransactionClient;

/**
 * Import différé du singleton Prisma — évite d'instancier un vrai client au simple chargement du
 * module `planning` (même raison que dans `absence.service.ts`).
 */
export async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}
