import { ApiError } from "@/lib/api-utils";

/** Corps JSON borné (routes publiques et terrain) : taille vérifiée avant lecture. */
export async function readJson(request: Request, maxBytes = 32 * 1024): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes) throw new ApiError(413, "Requête trop volumineuse");
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError(413, "Requête trop volumineuse");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new ApiError(400, "Données illisibles");
  }
}

export function xlsxResponse(buffer: Buffer, name: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
