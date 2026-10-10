import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "État de santé de l'application",
    description: "Teste la connexion à la base. Répond 503 avec `status: \"degraded\"` si la base est injoignable.",
    access: "session",
    accessNote: "le proxy exige une session pour cette route",
    response: "`{ status, version, db, uptime }` (uptime en secondes)",
  },
});
