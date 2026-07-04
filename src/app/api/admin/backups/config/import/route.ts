import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { applyImport } from "@/lib/config-import";

const importSchema = z.object({
  data: z.object({
    _meta: z.object({
      schemaVersion: z.number(),
      appVersion: z.string(),
      exportedAt: z.string(),
      categories: z.array(z.string()),
      scope: z.union([z.literal("all"), z.array(z.string())]),
      exportedBy: z.string(),
    }),
    churches: z.array(z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      secretariatEmail: z.string().nullable().optional(),
      accountingEmail: z.string().nullable().optional(),
      primaryColor: z.string().optional().default("#5E17EB"),
      ministries: z.array(z.any()).default([]),
      members: z.array(z.any()).default([]),
      userLinks: z.array(z.any()).default([]),
      userRoles: z.array(z.any()).default([]),
    })),
  }),
  strategy: z.enum(["SKIP", "UPDATE", "REPLACE"]),
  categories: z.array(z.enum(["structure", "members", "links"])).min(1),
});

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    if (!session.user.isSuperAdmin) {
      throw new ApiError(403, "Réservé aux super-administrateurs");
    }

    const body = importSchema.parse(await request.json());

    if (body.data._meta.schemaVersion !== 1) {
      throw new ApiError(400, `Version de schéma non supportée : ${body.data._meta.schemaVersion}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const importResult = await applyImport(body.data as any, body.strategy, body.categories);

    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "ConfigImport",
      entityId: `config-import-${new Date().toISOString()}`,
      details: {
        strategy: body.strategy,
        categories: body.categories,
        churches: body.data.churches.map((c) => c.id),
        created: importResult.created,
        updated: importResult.updated,
        skipped: importResult.skipped,
        errors: importResult.errors,
      },
    });

    return successResponse(importResult);
  } catch (error) {
    return errorResponse(error);
  }
}
