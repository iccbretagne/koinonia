import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const deptAssignmentSchema = z.object({
  id: z.string().min(1),
  isDeputy: z.boolean().optional().default(false),
});

export const roleSchema = z.object({
  churchId: z.string().min(1),
  role: z.enum([
    "SUPER_ADMIN",
    "ADMIN",
    "SECRETARY",
    "MINISTER",
    "DEPARTMENT_HEAD",
    "DISCIPLE_MAKER",
    "REPORTER",
    "STAR",
    "PASTORAL_CARE_REFERENT",
    "ACCOUNTANT",
  ]),
  ministryId: z.string().optional(),
  // Supporte les deux formats : string[] (legacy) ou { id, isDeputy }[]
  departmentIds: z.array(z.string()).optional(),
  departments: z.array(deptAssignmentSchema).optional(),
});

export const patchSchema = z.object({
  roleId: z.string().min(1),
  ministryId: z.string().nullable().optional(),
  departmentIds: z.array(z.string()).optional(),
  departments: z.array(deptAssignmentSchema).optional(),
});

export const contract = defineContract({
  POST: {
    summary: "Attribution d'un rôle à un utilisateur",
    description: "Anti-escalade (`canGrantRole`) : attribuer Admin ou Secrétaire exige `access:admins` dans l'église, et le rôle Super Admin ne s'attribue que par un Super Admin. Le rôle Ministre requiert un ministère, le rôle Responsable de département au moins un département, tous de l'église visée (400 sinon) ; `departments` distingue principal et adjoint (`isDeputy`), `departmentIds` est l'ancien format. Un Ministre au périmètre restreint ne peut attribuer que Ministre, Responsable de département ou STAR, dans ses propres ministères (403 sinon). L'utilisateur est notifié (sauf auto-attribution). Limité en débit. Journalisé.",
    access: "access:manage",
    accessNote: "dans l'église du corps ; Ministre borné à son ministère (`getUserMinistryScope`)",
    body: roleSchema,
    response: "Rôle créé, avec église, ministère et départements",
    status: 201,
  },
  PATCH: {
    summary: "Modification du ministère ou des départements d'un rôle",
    description: "`ministryId` ne s'applique qu'au rôle Ministre, `departments`/`departmentIds` qu'au rôle Responsable de département (400 sinon) ; les départements sont remplacés en bloc. Un Ministre au périmètre restreint doit rester dans son périmètre, avant comme après la modification (403 sinon). Limité en débit. Journalisé.",
    access: "access:manage",
    accessNote: "dans l'église du rôle modifié ; Ministre borné à son ministère (`getUserMinistryScope`)",
    body: patchSchema,
    response: "Rôle mis à jour, avec église, ministère et départements",
  },
  DELETE: {
    summary: "Retrait d'un rôle à un utilisateur",
    description: "Même règle d'anti-escalade qu'à l'attribution (`canGrantRole`) : retirer Admin ou Secrétaire exige `access:admins`, retirer Super Admin un Super Admin. Un Ministre au périmètre restreint ne retire que les rôles de ses ministères. Supprime aussi les départements rattachés au rôle. Limité en débit. Journalisé.",
    access: "access:manage",
    accessNote: "dans l'église du corps ; Ministre borné à son ministère (`getUserMinistryScope`)",
    body: roleSchema,
    response: "`{ success: true }`",
  },
});
