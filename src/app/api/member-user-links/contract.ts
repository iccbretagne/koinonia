import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z
  .object({
    memberId: z.string().optional(),
    newMember: z
      .object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phone: z.string().optional(),
        departmentId: z.string(),
      })
      .optional(),
    churchId: z.string(),
    userId: z.string().optional(),
    email: z.string().trim().email().optional(),
    // Double confirmation exigée avant de créer un compte dormant pour une adresse inconnue —
    // une erreur de frappe ne doit pas rattacher silencieusement un STAR à une adresse fantôme.
    confirmCreate: z.boolean().optional(),
  })
  .refine((d) => d.userId ?? d.email, { message: "userId ou email requis" })
  .refine((d) => !(d.memberId && d.newMember), { message: "memberId et newMember sont exclusifs" })
  .refine((d) => d.memberId ?? d.newMember, { message: "memberId ou newMember requis" });

export const deleteSchema = z.object({
  memberId: z.string(),
  churchId: z.string(),
});

export const contract = defineContract({
  POST: {
    summary: "Liaison d'un compte à une fiche STAR",
    description:
      "Rattachement direct par un administrateur (spec 037, spec 047) : compte désigné par `userId` ou par `email` exact, STAR par `memberId` (fiche existante) ou `newMember` (nouvelle fiche, exclusifs). " +
      "Admet le compte dans l'église. Un email inconnu renvoie 409 `{ accountNotFound: true }` tant que `confirmCreate` n'est pas vrai, puis crée un compte dormant. " +
      "409 si le STAR ou le compte est déjà lié dans l'église. Journalisé ; limité en débit par utilisateur.",
    access: "access:manage",
    accessNote: "borné au périmètre de l'appelant : fiche ou département de la nouvelle fiche hors périmètre refusé (403)",
    body: createSchema,
    status: 201,
    response: "Lien créé",
  },
  DELETE: {
    summary: "Déliaison d'un compte et d'une fiche STAR",
    description: "Journalisé ; limité en débit par utilisateur.",
    access: "access:manage",
    accessNote: "borné au périmètre de l'appelant : fiche hors périmètre refusée (403)",
    body: deleteSchema,
    response: "`{ deleted: true }`",
  },
});
