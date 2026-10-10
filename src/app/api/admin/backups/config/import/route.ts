import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { applyImport } from "@/lib/config-import";
import { importSchema } from "./contract";

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

    // Rétrocompatibilité : une sauvegarde prise avant le passage aux emails multiples
    // (spec 033) porte encore les champs singuliers `secretariatEmail`/`accountingEmail`.
    const data = {
      ...body.data,
      churches: body.data.churches.map((church) => ({
        ...church,
        secretariatEmails: church.secretariatEmails ?? church.secretariatEmail ?? null,
        accountingEmails:  church.accountingEmails ?? church.accountingEmail ?? null,
      })),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const importResult = await applyImport(data as any, body.strategy, body.categories);

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
