import { renderToBuffer } from "@react-pdf/renderer";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { FichePDF } from "./FichePDF";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

const MAX_PHOTO_SIZE = 8 * 1024 * 1024; // 8 Mo

// Un champ vide du formulaire arrive en "" : on le transforme en undefined
const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const yesNo = z
  .enum(["oui", "non"])
  .optional()
  .transform((v) => v === "oui");

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? new Date(v) : undefined))
  .refine((d) => d === undefined || !Number.isNaN(d.getTime()), "Date invalide");

const optionalEmail = z
  .union([z.literal(""), z.string().trim().email().max(200)])
  .optional()
  .transform((v) => v || undefined);

const optionalCount = z
  .string()
  .optional()
  .transform((v) => (v ? Number(v) : undefined))
  .pipe(z.number().int().min(0).max(30).optional());

const ficheSchema = z.object({
  nom: z.string().trim().min(1).max(100),
  prenom: z.string().trim().min(1).max(100),
  dateNaissance: z.string().min(1).pipe(z.coerce.date()),
  profession: optionalText(150),
  statutFamilial: z
    .enum(["CELIBATAIRE", "MARIE", "DIVORCE", "VEUF"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  enfants: optionalCount,

  rue: optionalText(200),
  ville: optionalText(100),
  codePostal: optionalText(20),
  pays: optionalText(100),
  telephone: optionalText(30),
  email: optionalEmail,

  baptise: yesNo,
  dateBapteme: optionalDate,
  lieuBapteme: optionalText(200),
  ancienneEglise: yesNo,
  nomEgliseAncienne: optionalText(200),
  villePaysEgliseAncienne: optionalText(200),

  dejaServi: yesNo,
  departementService: optionalText(200),
  serviceMinistere: optionalText(300),
  serviceCommunautaire: optionalText(300),
  autresRoles: optionalText(300),

  disponiblePourServir: yesNo,
  domainesInteret: optionalText(500),
  observations: optionalText(2000),

  formationPCNC: optionalText(100),
  infosSupplementaires: optionalText(2000),
  objectifsSpirituels: optionalText(2000),
  detailsSpecifiques: optionalText(2000),

  website: z.string().optional(), // champ piège anti-robot : rempli = robot
});

export async function POST(request: Request) {
  try {
    requireRateLimit(request, {
      prefix: `fiche-identite:public:${getClientIp(request)}`,
      windowMs: 60_000,
      max: 5,
    });

    const fd = await request.formData();

    // 1. Validation des champs texte
    const raw: Record<string, unknown> = Object.fromEntries(
      [...fd.entries()].filter(([, v]) => typeof v === "string"),
    );
    // Les cases à cocher envoient plusieurs valeurs sous le même nom
    raw.formationPCNC = fd.getAll("formationPCNC").join(", ");

    const parsed = ficheSchema.safeParse(raw);
    if (!parsed.success) throw parsed.error;
    const { website, ...data } = parsed.data;

    // Robot détecté par le champ piège : faux succès, aucun effet
    if (website) return successResponse({ ok: true }, 201);

    // 2. Preuve d'humanité AVANT tout effet de bord (photo, base, PDF, email)
    const token = fd.get("turnstileToken");
    if (typeof token !== "string" || !token) {
      throw new ApiError(400, "Vérification anti-robots manquante");
    }
    if (!(await verifyTurnstile(token, getClientIp(request)))) {
      throw new ApiError(400, "Vérification anti-robots échouée. Veuillez réessayer.");
    }

    // 3. Validation + conversion de la photo en JPEG
    const photo = fd.get("photo");
    if (!(photo instanceof File) || !photo.type.startsWith("image/")) {
      throw new ApiError(400, "Photo invalide");
    }
    if (photo.size > MAX_PHOTO_SIZE) {
      throw new ApiError(400, "Photo trop lourde (8 Mo max)");
    }
    const photoJpeg = await sharp(Buffer.from(await photo.arrayBuffer()))
      .rotate() // respecte l'orientation EXIF des photos de téléphone
      .resize(600, 800, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();

    // 4. Enregistrement en base
    const fiche = await prisma.ficheIdentite.create({ data });

   
     // Logo de l'Église pour l'en-tête du PDF ; sans logo, le PDF est quand même généré
     const logo = await readFile(
      join(process.cwd(), "public", "brand", "icc-rennes-logo-sombre.png"),
    ).catch(() => null);
  // 5. PDF avec la photo intégrée
    const pdf = await renderToBuffer(FichePDF({ fiche, photo: photoJpeg, logo }));

    // 6. Envoi aux deux adresses (la seconde en copie). Un échec d'envoi ne doit pas
    //    faire perdre la fiche, déjà enregistrée : on journalise.
    const receiver = process.env.FICHE_RECEIVER_EMAIL;
    if (!receiver) {
      logger.error({ ficheId: fiche.id }, "FICHE_RECEIVER_EMAIL non configuré : fiche non envoyée");
    } else {
      try {
        await sendEmail({
          to: receiver,
          cc: process.env.FICHE_CC_EMAIL || undefined,
          subject: `Nouvelle fiche d'identité : ${data.prenom} ${data.nom}`,
          html: "<p>Une nouvelle fiche d'identité vient d'être soumise. Elle est en pièce jointe.</p>",
          attachments: [{ filename: `fiche-${data.nom}-${data.prenom}.pdf`, content: pdf }],
        });
      } catch (err) {
        logger.error({ err, ficheId: fiche.id }, "Envoi de la fiche d'identité par email échoué");
      }
    }

    return successResponse({ id: fiche.id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}