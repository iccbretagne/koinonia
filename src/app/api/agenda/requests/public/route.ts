import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { sendEmail, buildAppointmentConfirmationEmail } from "@/lib/email";
import { notifyUsersWithRole } from "@/lib/notifications";
import { requireRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const AGE_RANGES = ["18-20 ans", "21-30 ans", "31-40 ans", "41-50 ans", "+50 ans"] as const;
const DURATIONS = ["Moins de 1 an", "1 à 2 ans", "2 à 3 ans", "3 à 5 ans", "+ 5 ans"] as const;
const MOTIFS = ["Renseignements", "Démarches administratives", "Vie familiale", "Croissance spirituelle", "Oppressions", "Maladie", "Service", "Études"] as const;
const DAYS = ["Mardi", "Dimanche"] as const;

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
  preferredDay: z.enum(DAYS, { errorMap: () => ({ message: "Veuillez sélectionner un jour" }) }),
  turnstileToken: z.string().min(1, "Vérification CAPTCHA manquante"),
});

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  const data = await res.json() as { success: boolean };
  return data.success === true;
}

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

    // Motifs → subject ; contexte démographique → message structuré
    const subject = data.motifs.join(", ");
    const message = [
      `Sexe : ${data.gender}`,
      `Tranche d'âge : ${data.ageRange}`,
      `À l'église depuis : ${data.membershipDuration}`,
      `STAR : ${data.isStar}${data.isStar === "Oui" && data.department ? ` — Département : ${data.department}` : ""}`,
    ].join("\n");

    const req = await prisma.appointmentRequest.create({
      data: {
        churchId: church.id,
        userId: null,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        subject,
        message,
        preferredDays: data.preferredDay,
      },
    });

    notifyUsersWithRole(church.id, "AGENDA_QUALIFIER", {
      type: "AGENDA_REQUEST_PENDING",
      title: "Nouvelle demande de RDV",
      message: `${data.firstName} ${data.lastName} a soumis une demande : « ${subject} ».`,
      link: "/agenda/requests",
    }).catch(() => {});

    const { subject: emailSubject, html } = buildAppointmentConfirmationEmail({
      firstName: data.firstName,
      lastName: data.lastName,
      subject,
      churchName: church.name,
    });
    await sendEmail({ to: data.email, subject: emailSubject, html }).catch((err) => {
      console.error("[agenda/requests/public] sendEmail failed:", err?.message ?? err);
    });

    return successResponse({ id: req.id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
