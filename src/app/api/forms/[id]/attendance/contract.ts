import { defineContract } from "@/lib/openapi/contract";
import { attendanceQuerySchema, attendanceSchema } from "@/modules/forms/schemas";

export { attendanceQuerySchema, attendanceSchema };

const ACCESS_NOTE = "dans l'église du formulaire, ou intervenant désigné (son périmètre) tant que le formulaire n'est pas clôturé";

export const contract = defineContract({
  GET: {
    summary: "Feuille de présence d'une session",
    description: "Inscrits confirmés de la session (périmètre de l'intervenant), avec leur niveau et leurs cases jour × matin/après-midi.",
    access: "forms:manage",
    accessNote: ACCESS_NOTE,
    query: attendanceQuerySchema,
    response: "Session et lignes de la feuille",
  },
  PUT: {
    summary: "Saisie des présences",
    description:
      "Enregistre des cases ; la dernière saisie l'emporte (plusieurs intervenants en même temps). Inscrit hors session, hors périmètre ou non confirmé : 404. Chaque case modifiée est journalisée.",
    access: "forms:manage",
    accessNote: ACCESS_NOTE,
    body: attendanceSchema,
    response: "Nombre de cases modifiées",
  },
});
