import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const addSchema = z.object({ departmentId: z.string().min(1, "Le département est requis") });

export const contract = defineContract({
  POST: {
    summary: "Rattachement d'un STAR à un département",
    description: "Le STAR peut venir de n'importe quel département de l'église ; seul le département de destination doit être dans le périmètre de l'appelant (403 sinon). Journalisé.",
    access: "members:manage",
    accessNote: "dans l'église du département ; borné au périmètre de gestion pour le département cible",
    body: addSchema,
    response: "STAR mis à jour, avec ses départements",
  },
  DELETE: {
    summary: "Retrait d'un STAR d'un département",
    description: "Ne supprime pas la fiche. Sur la dernière affiliation, le STAR bascule vers le département système « Sans département ». Journalisé.",
    access: "members:manage",
    accessNote: "dans l'église du STAR ; le département retiré doit être dans le périmètre de gestion (403 sinon)",
    query: z.object({ departmentId: z.string().describe("Département dont retirer le STAR") }),
    response: "STAR mis à jour, avec ses départements",
  },
});
