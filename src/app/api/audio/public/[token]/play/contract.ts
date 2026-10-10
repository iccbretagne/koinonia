import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({ segmentId: z.string().min(1) });

export const contract = defineContract({
  POST: {
    summary: "Comptage d'une écoute par lien public",
    description: "Limité par adresse IP. Le compteur n'augmente que si le culte est encore publié (410 sinon).",
    access: "token",
    body: schema,
    response: "`{ ok: true }`",
  },
});
