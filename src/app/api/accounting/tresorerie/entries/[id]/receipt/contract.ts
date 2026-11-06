import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Justificatif d'une ligne de trésorerie",
    description: "Fichier servi avec `X-Content-Type-Options: nosniff` et un cache privé.",
    access: "treasury:manage",
    accessNote: "dans l'église de la ligne",
    params: z.object({ id: z.string() }),
    responseType: "application/octet-stream",
    response: "Fichier (image ou PDF)",
  },
});
