import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const requestDomainSchema = z.object({ host: z.string().trim().min(3).max(253) }).strict();

const access = { access: "session", accessNote: "organisateur de l'événement (rôle `configure`) : le domaine engage l'église, la Communication n'y a pas accès" } as const;

export const contract = defineContract({
  GET: { ...access, summary: "Domaine dédié du site", description: "État du domaine (en attente, vérifié, approuvé, suspendu), dernier message d'erreur et enregistrements DNS à créer. `null` sans demande.", response: "Domaine ou `null`" },
  POST: { ...access, summary: "Demande d'un domaine dédié", description: "Un domaine par site, cinq par église (hors suspendus). Refuse un domaine invalide, déjà pris, sous le domaine des sites ou celui de l'application. Renvoie le jeton de preuve à publier en TXT.", body: requestDomainSchema, response: "Domaine demandé et enregistrements DNS" },
  DELETE: { ...access, summary: "Suppression du domaine dédié", description: "Le site redevient servi par son adresse Koinonia.", response: "Rien" },
});
