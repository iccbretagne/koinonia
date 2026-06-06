import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireIntegrationAccess } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { geocodeAddress, findFamilyByCoords } from "@/lib/family-geo";
import { z } from "zod";
import type { FamilyAgeRange, FamilyChurchStatus, FamilyIntegrationStatus, Prisma } from "@/generated/prisma/client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    const { scope } = await requireIntegrationAccess(churchId);

    const status = searchParams.get("status") as FamilyIntegrationStatus | null;
    const familyId = searchParams.get("familyId");
    const search = searchParams.get("search");

    const where: Prisma.FamilyIntegrationRequestWhereInput = {
      churchId,
      archivedAt: null,
      ...(status && { status }),
      ...(familyId && { assignedFamilyId: parseInt(familyId) }),
      ...(scope.scoped && { assignedFamilyId: { in: scope.familyIds } }),
      ...(search && {
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } },
          { phone: { contains: search } },
        ],
      }),
    };

    const requests = await prisma.familyIntegrationRequest.findMany({
      where,
      include: {
        assignedBerger: { select: { id: true, name: true, email: true } },
        member: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { submittedAt: "desc" },
    });

    return successResponse(requests);
  } catch (error) {
    return errorResponse(error);
  }
}

const createSchema = z.object({
  // Identité
  firstName:    z.string().min(1).max(100),
  lastName:     z.string().min(1).max(100),
  email:        z.string().email().optional().or(z.literal("")),
  phone:        z.string().min(1, "Le téléphone est obligatoire").max(30),
  // Adresse
  address:      z.string().max(500).optional().or(z.literal("")),
  // Profil
  ageRange:     z.enum(["YOUTH", "YOUNG_ADULT", "ADULT", "SENIOR"]),
  churchStatus: z.enum(["VISITOR", "REGULAR", "ENGAGED"]).default("VISITOR"),
  // Options
  pastoralCareRequested: z.boolean().default(false),
  pastoralMessage:       z.string().max(2000).optional().or(z.literal("")),
  // Lien membre optionnel (si connecté)
  memberId:    z.string().optional(),
  churchId:    z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    // Vérifier que l'église existe
    const church = await prisma.church.findUnique({
      where: { id: data.churchId },
      select: { id: true, name: true },
    });
    if (!church) throw new ApiError(404, "Église introuvable");

    // Vérifier le lien membre si fourni
    if (data.memberId) {
      const member = await prisma.member.findFirst({
        where: {
          id: data.memberId,
          departments: { some: { department: { ministry: { churchId: data.churchId } } } },
        },
        select: { id: true },
      });
      if (!member) throw new ApiError(400, "Membre introuvable");
    }

    // Géolocalisation de l'adresse
    let lat: number | null = null;
    let lng: number | null = null;
    let suggestedFamilyId: number | null = null;
    let suggestedFamilyName: string | null = null;

    if (data.address) {
      const geo = await geocodeAddress(data.address);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
        const family = await findFamilyByCoords(geo.lat, geo.lng);
        if (family) {
          suggestedFamilyId = family.familyId;
          suggestedFamilyName = family.familyName;
        }
      }
    }

    // Créer un AppointmentRequest si soin pastoral demandé
    let appointmentRequestId: string | null = null;
    if (data.pastoralCareRequested) {
      const appt = await prisma.appointmentRequest.create({
        data: {
          churchId: data.churchId,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email || null,
          phone: data.phone,
          subject: "Soins pastoraux (demande intégration famille)",
          message: data.pastoralMessage || "Demande de soin pastoral via formulaire d'intégration famille.",
        },
        select: { id: true },
      });
      appointmentRequestId = appt.id;
    }

    // Créer la demande d'intégration
    const integrationRequest = await prisma.familyIntegrationRequest.create({
      data: {
        churchId: data.churchId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: data.phone,
        address: data.address || null,
        lat,
        lng,
        ageRange: data.ageRange as FamilyAgeRange,
        churchStatus: data.churchStatus as FamilyChurchStatus,
        memberId: data.memberId || null,
        pastoralCareRequested: data.pastoralCareRequested,
        appointmentRequestId,
        suggestedFamilyId,
        suggestedFamilyName,
        status: "SUBMITTED",
      },
    });

    // Email de confirmation au demandeur
    if (data.email) {
      await sendEmail({
        to: data.email,
        subject: `${church.name} — Demande d'intégration reçue`,
        html: buildConfirmationEmail({
          firstName: data.firstName,
          churchName: church.name,
          suggestedFamilyName,
          pastoralCare: data.pastoralCareRequested,
        }),
      }).catch(() => {
        // Email non bloquant
      });
    }

    return successResponse(
      { id: integrationRequest.id, suggestedFamilyName },
      201
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function buildConfirmationEmail(params: {
  firstName: string;
  churchName: string;
  suggestedFamilyName: string | null;
  pastoralCare: boolean;
}): string {
  const { firstName, churchName, suggestedFamilyName, pastoralCare } = params;

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="background:#5E17EB;padding:32px 32px 24px">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700">${churchName}</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:14px">Demande d'intégration reçue</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;color:#111827;font-size:15px">Bonjour ${firstName},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6">
        Nous avons bien reçu ta demande pour rejoindre une famille. Notre équipe va prendre en charge ton dossier et te contacter très prochainement.
      </p>
      ${suggestedFamilyName ? `
      <div style="background:#f5f3ff;border-left:4px solid #5E17EB;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 16px">
        <p style="margin:0;color:#5E17EB;font-size:13px;font-weight:600">Famille suggérée</p>
        <p style="margin:4px 0 0;color:#374151;font-size:14px">${suggestedFamilyName}</p>
      </div>` : ""}
      ${pastoralCare ? `
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 16px">
        <p style="margin:0;color:#92400e;font-size:13px">Ta demande de rendez-vous pastoral a également été enregistrée. Un pasteur te contactera séparément.</p>
      </div>` : ""}
      <p style="margin:24px 0 0;color:#6b7280;font-size:13px">
        À bientôt,<br>
        <strong style="color:#111827">L'équipe d'intégration — ${churchName}</strong>
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;color:#9ca3af;font-size:11px">Ce message est automatique. Merci de ne pas y répondre directement.</p>
    </div>
  </div>
</body>
</html>`;
}
