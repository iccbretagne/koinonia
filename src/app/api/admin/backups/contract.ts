import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Liste des sauvegardes de la base",
    description: "400 si le stockage S3 des sauvegardes n'est pas configuré.",
    access: "superAdmin",
    response: "Sauvegardes disponibles (clé, taille, date)",
  },
  POST: {
    summary: "Lancement d'une sauvegarde de la base",
    description: "Dump SQL complet déposé sur S3. Journalisé.",
    access: "superAdmin",
    status: 201,
    response: "Sauvegarde créée",
  },
});
