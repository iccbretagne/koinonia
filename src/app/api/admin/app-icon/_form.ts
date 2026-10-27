import { ApiError } from "@/lib/api-utils";
import { APP_ICON_MAX_BYTES, appIconBackgroundSchema } from "@/modules/core/schemas";

/** Deux fichiers de 5 Mo plus l'enveloppe multipart. */
const MAX_BODY_BYTES = 11 * 1024 * 1024;

async function fileBuffer(value: FormDataEntryValue | null): Promise<Buffer | null> {
  if (value === null || value === "") return null;
  if (!(value instanceof File)) throw new ApiError(400, "Fichier invalide");
  if (value.size === 0) return null;
  if (value.size > APP_ICON_MAX_BYTES) throw new ApiError(400, "Le fichier dépasse 5 Mo.");
  return Buffer.from(new Uint8Array(await value.arrayBuffer()));
}

/**
 * Lit le formulaire de dépôt de l'icône (spec 069) : taille bornée avant toute lecture du corps,
 * fichiers `icon` et `badge` facultatifs, `background` validé.
 */
export async function readAppIconForm(request: Request) {
  const length = request.headers.get("content-length");
  if (!length) throw new ApiError(411, "Longueur du fichier requise");
  if (Number(length) > MAX_BODY_BYTES) throw new ApiError(413, "Le fichier dépasse 5 Mo.");

  const form = await request.formData();
  const rawBackground = form.get("background");
  const background =
    typeof rawBackground === "string" && rawBackground !== "" ? appIconBackgroundSchema.parse(rawBackground) : undefined;
  return { icon: await fileBuffer(form.get("icon")), badge: await fileBuffer(form.get("badge")), background };
}
