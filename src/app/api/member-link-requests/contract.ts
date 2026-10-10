import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const roleSchema = z
  .enum(["DEPARTMENT_HEAD", "DEPUTY", "MINISTER", "DISCIPLE_MAKER", "REPORTER"])
  .nullable()
  .optional();

export const createSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("existing"),
    memberId: z.string().min(1),
    churchId: z.string().min(1),
    departmentId: z.string().optional(),
    ministryId: z.string().optional(),
    requestedRole: roleSchema,
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    type: z.literal("new"),
    firstName: z.string().min(1, "Le prénom est requis"),
    lastName: z.string().min(1, "Le nom est requis"),
    phone: z.string().optional(),
    churchId: z.string().min(1, "L'église est requise"),
    departmentId: z.string().optional(),
    ministryId: z.string().optional(),
    requestedRole: roleSchema,
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    type: z.literal("no_star"),
    churchId: z.string().min(1, "L'église est requise"),
    requestedRole: z.enum(["DISCIPLE_MAKER", "REPORTER"]),
    notes: z.string().max(1000).optional(),
  }),
]);

export const contract = defineContract({
  GET: {
    summary: "Liste des demandes de liaison de compte",
    description: "Demandes de rattachement d'un compte à une fiche STAR (spec 054/#583).",
    access: "access:manage",
    accessNote: "un Ministre ne voit que les demandes de ses ministères",
    query: z.object({
      churchId: z.string().describe("Église visée"),
      status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional().describe("Statut ; défaut : `PENDING`"),
    }),
    response: "Demandes, de la plus récente à la plus ancienne, avec compte, STAR visé, département, ministère et église",
  },
  POST: {
    summary: "Dépôt d'une demande de liaison de compte",
    description:
      "Trois types : `existing` (STAR existant non lié), `new` (nouvelle fiche à créer à l'approbation), `no_star` (rôle sans fiche : Faiseur de Disciples ou Reporter). " +
      "409 si une demande est déjà en attente ou si le compte est déjà lié dans l'église, ou si le STAR est déjà lié. Notifie l'administration et le secrétariat de l'église. Limité en débit par utilisateur.",
    access: "session",
    accessNote: "toute personne connectée, pour son propre compte",
    body: createSchema,
    status: 201,
    response: "Demande créée (en attente)",
  },
});
