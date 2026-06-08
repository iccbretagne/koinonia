import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireIntegrationAccess, buildConfirmationEmail } from "@/modules/integration";
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
  // Appel au salut
  salvationCall: z.boolean().default(false),
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
        salvationCall: data.salvationCall,
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

