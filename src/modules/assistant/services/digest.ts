import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { countOpenPending } from "./pending";

/**
 * Résumé hebdomadaire (tâche cron `assistant-digest`, spec 075) : s'il reste des questions à
 * traiter, les Super Admins sont prévenus (domaine `assistant`). Aucune question n'est citée :
 * seulement leur nombre, et le lien vers l'écran.
 */
export async function runAssistantDigest() {
  const open = await countOpenPending();
  if (open === 0) return { open, notified: 0 };
  const admins = await prisma.user.findMany({ where: { isSuperAdmin: true }, select: { id: true } });
  if (admins.length === 0) return { open, notified: 0 };
  await notifyUsers(
    admins.map((a) => a.id),
    {
      domain: "assistant",
      type: "ASSISTANT_PENDING",
      title: "Questions à traiter pour l'assistant",
      message: `${open} question${open > 1 ? "s" : ""} posée${open > 1 ? "s" : ""} à l'assistant attend${open > 1 ? "ent" : ""} une réponse dans la base.`,
      link: "/admin/assistant",
    }
  );
  return { open, notified: admins.length };
}
