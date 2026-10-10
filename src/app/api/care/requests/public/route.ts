import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { submitAppointmentRequest } from "@/modules/care";
import { submitSchema } from "./contract";

// Spec 052 (lot 1) : le jour préféré n'est plus proposé sur le formulaire public.

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    requireRateLimit(request, { prefix: `public-rdv:${ip}`, windowMs: 60_000, max: 3 });

    const body = await request.json();
    const data = submitSchema.parse(body);

    const valid = await verifyTurnstile(data.turnstileToken, ip);
    if (!valid) throw new ApiError(400, "Vérification anti-robots échouée. Veuillez réessayer.");

    const church = await prisma.church.findUnique({
      where: { slug: data.churchSlug },
      select: { id: true, name: true },
    });
    if (!church) throw new ApiError(404, "Église introuvable");

    // Motifs → subject ; message libre (facultatif) + contexte démographique → message structuré
    const subject = data.motifs.join(", ");
    const starDepartment =
      data.isStar === "Oui" && data.department ? ` — Département : ${data.department}` : "";
    const message = [
      data.details,
      [
        `Sexe : ${data.gender}`,
        `Tranche d'âge : ${data.ageRange}`,
        `À l'église depuis : ${data.membershipDuration}`,
        `STAR : ${data.isStar}${starDepartment}`,
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
