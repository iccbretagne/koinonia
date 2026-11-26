import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Mes campagnes de collecte",
    description:
      "Campagnes que le compte pilote dans ses églises (`campaigns:manage` ou gestionnaire désigné), avec leur avancement, et questionnaires dont il est répondant (campagne ouverte ou clôturée, jamais en brouillon), avec leur état et leur échéance.",
    access: "session",
    response: "`{ managed: [...], assignments: [...] }`",
  },
});
