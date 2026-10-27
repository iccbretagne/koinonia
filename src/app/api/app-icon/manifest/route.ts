import { errorResponse } from "@/lib/api-utils";
import { appIconUrl, getAppIconVersion } from "@/modules/core";

/**
 * Manifeste de l'application installable (spec 069). Servi par une route et non par
 * `public/manifest.json` : ses icônes suivent l'icône déposée, avec une adresse versionnée.
 */
export async function GET() {
  try {
    const version = await getAppIconVersion();
    const manifest = {
      name: "Koinonia",
      short_name: "Koinonia",
      description: "Le back-office opérationnel de votre église, en une seule application.",
      start_url: "/accueil",
      display: "standalone",
      background_color: "#0c022d",
      theme_color: "#ffffff",
      icons: [
        { src: appIconUrl("icon-192", version), sizes: "192x192", type: "image/png" },
        { src: appIconUrl("icon-512", version), sizes: "512x512", type: "image/png" },
        { src: appIconUrl("icon-maskable-512", version), sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };
    return new Response(JSON.stringify(manifest), {
      headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
