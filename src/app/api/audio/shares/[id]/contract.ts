import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  DELETE: {
    summary: "Fin d'un partage de bibliothèque",
    description: "Journalisé.",
    access: "audio:manage",
    response: "`{ ok: true }`",
  },
});
