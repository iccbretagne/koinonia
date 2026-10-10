import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Clôture d'un désistement sans remplaçant (« Ne pas remplacer »)",
    description: "Spec 061.",
    access: "planning:edit",
    accessNote: "borné au périmètre départemental du désistement",
    response: "`{ withdrawal }` : désistement clos",
  },
});
