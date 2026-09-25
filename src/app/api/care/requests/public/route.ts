import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { submitAppointmentRequest } from "@/modules/care";
import { z } from "zod";

const AGE_RANGES = ["18-20 ans", "21-30 ans", "31-40 ans", "41-50 ans", "+50 ans"] as const;
const DURATIONS = ["Moins de 1 an", "1 à 2 ans", "2 à 3 ans", "3 à 5 ans", "+ 5 ans"] as const;
const MOTIFS = ["Renseignements", "Démarches administratives", "Vie familiale", "Croissance spirituelle", "Oppressions", "Maladie", "Service", "Études"] as const;

// Spec 052 (lot 1) : le jour préféré n'est plus proposé sur le formulaire public.
const submitSchema = z.object({
  churchSlug: z.string().min(1),
  lastName: z.string().min(1, "Le nom est requis"),
  firstName: z.string().min(1, "Le prénom est requis"),
  gender: z.enum(["Homme", "Femme"], { errorMap: () => ({ message: "Veuillez sélectionner votre sexe" }) }),
  phone: z.string().min(1, "Le téléphone est requis"),
  email: z.string().email("Email invalide"),
  ageRange: z.enum(AGE_RANGES, { errorMap: () => ({ message: "Veuillez sélectionner votre tranche d'âge" }) }),
  membershipDuration: z.enum(DURATIONS, { errorMap: () => ({ message: "Veuillez sélectionner votre ancienneté à l'église" }) }),
  isStar: z.enum(["Oui", "Non"], { errorMap: () => ({ message: "Veuillez répondre à cette question" }) }),
  department: z.string().nullable().optional(),
  motifs: z.array(z.enum(MOTIFS)).min(1, "Veuillez sélectionner au moins un motif"),
  details: z.string().trim().max(2000, "2000 caractères maximum").optional(),
  turnstileToken: z.string().min(1, "Vérification CAPTCHA manquante"),
});

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    requireRateLimit(request, { prefix: `public-rdv:${ip}`, windowMs: 60_000, max: 3 });

    const body = await request.json();
    const data = submitSchema.parse(body);

    const valid = await verifyTurnstile(data.turnstileToken, ip);
    if (!valid) throw new ApiError(400, "Vérification CAPTCHA échouée. Veuillez réessayer.");

    const church = await prisma.church.findUnique({
      where: { slug: data.churchSlug },
      select: { id: true, name: true },
    });
    if (!church) throw new ApiError(404, "Église introuvable");

    // Motifs → subject ; message libre (facultatif) + contexte démographique → message structuré
    const subject = data.motifs.join(", ");
    const message = [
      data.details,
      [
        `Sexe : ${data.gender}`,
        `Tranche d'âge : ${data.ageRange}`,
        `À l'église depuis : ${data.membershipDuration}`,
        `STAR : ${data.isStar}${data.isStar === "Oui" && data.department ? ` — Département : ${data.department}` : ""}`,
      ].join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const created = await submitAppointmentRequest(
      {
        churchId: church.id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        subject,
        message,
      },
      null
    );

    return successResponse({ id: created.id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
