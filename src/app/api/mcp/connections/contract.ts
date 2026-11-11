import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "MCP : mes assistants connectés",
    description: "Connexions actives du compte, toutes églises confondues (assistant, église, date, dernière utilisation).",
    access: "session",
    response: "Liste des connexions",
  },
});
