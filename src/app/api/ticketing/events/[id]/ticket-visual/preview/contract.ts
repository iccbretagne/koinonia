import { defineContract } from "@/lib/openapi/contract";
import { ticketVisualSchema } from "@/modules/ticketing/schemas";
export const previewSchema = ticketVisualSchema;
export const contract = defineContract({
  GET: { summary: "Aperçu fictif du brouillon du billet", access: "session", accessNote: "rôle de lecture sur l'événement", response: "PNG", responseType: "image/png" },
  POST: { summary: "Aperçu sans enregistrement du visuel", access: "session", accessNote: "organisateur", body: previewSchema, response: "PNG", responseType: "image/png", description: "Nom long fictif et QR non valable. 60 rendus par minute et par compte." },
});
