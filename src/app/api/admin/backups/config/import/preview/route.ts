import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { previewImport } from "@/lib/config-import";

const configMetaSchema = z.object({
  schemaVersion: z.number(),
  appVersion: z.string(),
  exportedAt: z.string(),
  categories: z.array(z.string()),
  scope: z.union([z.literal("all"), z.array(z.string())]),
  exportedBy: z.string(),
});

const previewSchema = z.object({
  _meta: configMetaSchema,
  churches: z.array(z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    secretariatEmail: z.string().nullable().optional(),
    accountingEmail: z.string().nullable().optional(),
    primaryColor: z.string().optional(),
    ministries: z.array(z.any()).optional(),
    members: z.array(z.any()).optional(),
    userLinks: z.array(z.any()).optional(),
    userRoles: z.array(z.any()).optional(),
  })),
});

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    if (!session.user.isSuperAdmin) {
      throw new ApiError(403, "Réservé aux super-administrateurs");
    }

    const body = previewSchema.parse(await request.json());

    if (body._meta.schemaVersion !== 1) {
      throw new ApiError(400, `Version de schéma non supportée : ${body._meta.schemaVersion}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const preview = await previewImport(body as any);
    return successResponse(preview);
  } catch (error) {
    return errorResponse(error);
  }
}
