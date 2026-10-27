import { ApiError, errorResponse } from "@/lib/api-utils";
import { defaultAppIconPath, getAppIconVariant, getAppIconVersion } from "@/modules/core";
import { isAppIconVariant } from "@/modules/core/schemas";

/**
 * Icône de l'application (spec 069) : une seule adresse, quelle que soit l'origine de l'image.
 * Icône déposée : servie depuis la base ; sinon, redirection vers le fichier livré.
 */
export async function GET(request: Request, { params }: { params: Promise<{ variant: string }> }) {
  try {
    const { variant: raw } = await params;
    const variant = raw.replace(/\.png$/, "");
    if (!isAppIconVariant(variant)) throw new ApiError(404, "Icône inconnue");

    const icon = await getAppIconVariant(variant);
    if (!icon) {
      const custom = (await getAppIconVersion()) !== "default";
      return new Response(null, {
        status: 302,
        headers: {
          Location: new URL(defaultAppIconPath(variant, custom), request.url).toString(),
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    const requested = new URL(request.url).searchParams.get("v");
    return new Response(Buffer.from(icon.data), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control":
          requested === icon.version ? "public, max-age=31536000, immutable" : "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
