import { defineContract } from "@/lib/openapi/contract";
export const contract = defineContract({
  GET: { summary: "Image du billet (équipe)", access: "session", accessNote: "rôle de lecture sur l'événement", response: "WebP", responseType: "image/webp" },
  DELETE: { summary: "Supprimer une image inutilisée du billet", access: "session", accessNote: "organisateur", response: "`{ ok: true }`", description: "409 si référencée par le brouillon ou la publication ; propriété vérifiée, journalisé." },
});
