import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { exportConfig } from "@/lib/config-export";

const exportSchema = z.object({
  scope: z.union([z.literal("all"), z.array(z.string())]),
  categories: z.array(z.enum(["structure", "members", "links"])).min(1),
});

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    if (!session.user.isSuperAdmin) {
      throw new ApiError(403, "Réservé aux super-administrateurs");
    }

    const body = exportSchema.parse(await request.json());
    const appVersion = process.env.npm_package_version ?? "unknown";

    const data = await exportConfig(
      body.scope,
      body.categories,
      session.user.email ?? session.user.id!,
      appVersion
    );

    await logAudit({
      userId: session.user.id,
      action: "CREATE",
      entityType: "ConfigExport",
      entityId: `config-export-${data._meta.exportedAt}`,
      details: {
        scope: body.scope,
        categories: body.categories,
        churches: data.churches.length,
      },
    });

    const filename = `koinonia-config-${new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "")}.json`;
    const json = JSON.stringify(data, null, 2);

    return new Response(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
