import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Dépôt d'une pièce jointe comptable",
    description: "JPEG, PNG ou PDF, 5 Mo au plus. Avec `requestId`, la demande doit être celle du déposant et encore `SUBMITTED` ; sans, la pièce reste orpheline jusqu'à son rattachement.",
    access: "accounting:submit",
    accessNote: "dans l'église courante",
    body: { contentType: "multipart/form-data", description: "`file` (fichier), `requestId` (facultatif)" },
    status: 201,
    response: "Pièce jointe créée",
  },
});
