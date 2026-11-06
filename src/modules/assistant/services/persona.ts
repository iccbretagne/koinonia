import type { AssistantPersona } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/** Personnage choisi par le compte (spec 075) : Nia par défaut. */
export async function getPersona(userId: string): Promise<AssistantPersona> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { assistantPersona: true } });
  return user?.assistantPersona ?? "NIA";
}

export async function setPersona(userId: string, persona: AssistantPersona): Promise<AssistantPersona> {
  await prisma.user.update({ where: { id: userId }, data: { assistantPersona: persona } });
  return persona;
}
