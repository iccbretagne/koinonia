import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  PATCH: {
    summary: "Visite guidée marquée comme vue",
    access: "session",
    accessNote: "agit sur le compte de l'appelant",
    response: "`{ hasSeenTour: true }`",
  },
});
