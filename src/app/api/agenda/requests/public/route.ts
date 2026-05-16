import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { sendEmail, buildAppointmentConfirmationEmail } from "@/lib/email";
import { requireRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const submitSchema = z.object({
  churchSlug: z.string().min(1),
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  email: z.string().email("Email invalide"),
  phone: z.string().nullable().optional(),
  subject: z.string().min(1, "L'objet est requis"),
  message: z.string().min(10, "Le message est trop court"),
  preferredDays: z.string().nullable().optional(),
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

    const req = await prisma.appointmentRequest.create({
      data: {
        churchId: church.id,
        userId: null,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone ?? null,
        subject: data.subject,
        message: data.message,
        preferredDays: data.preferredDays ?? null,
      },
    });

    const { subject, html } = buildAppointmentConfirmationEmail({
      firstName: data.firstName,
      lastName: data.lastName,
      subject: data.subject,
      churchName: church.name,
    });
    await sendEmail({ to: data.email, subject, html }).catch(() => {
      // Email non bloquant — la demande est enregistrée même si l'envoi échoue
    });

    return successResponse({ id: req.id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
