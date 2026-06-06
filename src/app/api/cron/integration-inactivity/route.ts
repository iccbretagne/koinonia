import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { sendEmail } from "@/lib/email";

const INACTIVITY_DAYS = 7;
const NOTIF_TYPE = "INTEGRATION_INACTIVITY";

function authorizeCron(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    throw new ApiError(401, "Unauthorized");
  }
}

export async function POST(request: Request) {
  try {
    authorizeCron(request);

    const threshold = new Date();
    threshold.setDate(threshold.getDate() - INACTIVITY_DAYS);

    // Seuil anti-doublon : ne pas re-notifier si une notif a été créée il y a < 7 jours
    const dedupeThreshold = new Date();
    dedupeThreshold.setDate(dedupeThreshold.getDate() - INACTIVITY_DAYS);

    const staleRequests = await prisma.familyIntegrationRequest.findMany({
      where: {
        archivedAt: null,
        status: { in: ["SUBMITTED", "ASSIGNED", "CONTACTED"] },
        updatedAt: { lt: threshold },
      },
      include: {
        assignedBerger: { select: { id: true, name: true, email: true } },
        church: { select: { id: true, name: true } },
      },
    });

    if (staleRequests.length === 0) {
      return successResponse({ notified: 0, skipped: 0 });
    }

    // Récupérer les notifs récentes pour éviter les doublons
    const requestIds = staleRequests.map((r) => r.id);
    const recentNotifs = await prisma.notification.findMany({
      where: {
        type: NOTIF_TYPE,
        link: { in: requestIds.map((id) => `/integration/requests/${id}`) },
        createdAt: { gte: dedupeThreshold },
      },
      select: { link: true },
    });
    const alreadyNotifiedLinks = new Set(recentNotifs.map((n) => n.link));

    // Charger les managers intégration par église (cache par churchId)
    const managersByChurch: Record<string, { id: string; email: string | null }[]> = {};

    async function getManagers(churchId: string) {
      if (managersByChurch[churchId]) return managersByChurch[churchId];

      const integrationDept = await prisma.department.findFirst({
        where: { function: "INTEGRATION", ministry: { churchId } },
        select: { id: true },
      });
      if (!integrationDept) {
        managersByChurch[churchId] = [];
        return [];
      }

      const memberships = await prisma.userDepartment.findMany({
        where: { departmentId: integrationDept.id },
        include: { userChurchRole: { select: { userId: true, user: { select: { id: true, email: true } } } } },
      });
      const managers = memberships.map((m) => ({
        id: m.userChurchRole.userId,
        email: m.userChurchRole.user.email,
      }));
      managersByChurch[churchId] = managers;
      return managers;
    }

    let notified = 0;
    let skipped = 0;

    for (const req of staleRequests) {
      const link = `/integration/requests/${req.id}`;
      if (alreadyNotifiedLinks.has(link)) { skipped++; continue; }

      const personName = `${req.firstName} ${req.lastName}`;
      const daysSince = Math.floor((Date.now() - req.updatedAt.getTime()) / 86_400_000);

      const titleMap: Record<string, string> = {
        SUBMITTED: "Demande sans suite depuis 7 jours",
        ASSIGNED: "Contact non établi depuis 7 jours",
        CONTACTED: "Suivi en attente depuis 7 jours",
      };
      const title = titleMap[req.status] ?? "Demande inactive";
      const message = `${personName} — aucune mise à jour depuis ${daysSince} jours.`;

      if (req.status === "SUBMITTED") {
        // Notifier les managers intégration : demande non affectée
        const managers = await getManagers(req.churchId);
        for (const manager of managers) {
          await prisma.notification.create({
            data: { userId: manager.id, type: NOTIF_TYPE, title, message, link },
          });
          notified++;

          if (process.env.SMTP_HOST && manager.email) {
            await sendEmail({
              to: manager.email,
              subject: `${req.church.name} — ${title}`,
              html: buildInactivityEmail({ churchName: req.church.name, personName, status: req.status, daysSince, link }),
            }).catch(() => {});
          }
        }
      } else if (req.assignedBerger) {
        // Notifier le berger assigné : pas de progression
        await prisma.notification.create({
          data: {
            userId: req.assignedBerger.id,
            type: NOTIF_TYPE,
            title,
            message,
            link,
          },
        });
        notified++;

        if (process.env.SMTP_HOST && req.assignedBerger.email) {
          await sendEmail({
            to: req.assignedBerger.email,
            subject: `${req.church.name} — ${title}`,
            html: buildInactivityEmail({ churchName: req.church.name, personName, status: req.status, daysSince, link }),
          }).catch(() => {});
        }
      }
    }

    return successResponse({ notified, skipped, total: staleRequests.length });
  } catch (error) {
    return errorResponse(error);
  }
}

function buildInactivityEmail(params: {
  churchName: string;
  personName: string;
  status: string;
  daysSince: number;
  link: string;
}): string {
  const { churchName, personName, status, daysSince, link } = params;

  const contextMap: Record<string, string> = {
    SUBMITTED: "La demande n'a pas encore été affectée à une famille.",
    ASSIGNED: "La demande a été affectée mais le contact n'a pas encore été établi.",
    CONTACTED: "Le contact a été établi mais aucune progression n'a été enregistrée.",
  };
  const context = contextMap[status] ?? "Aucune mise à jour récente.";

  const appUrl = process.env.NEXTAUTH_URL ?? "";

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="background:#5E17EB;padding:28px 32px">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${churchName}</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px">Rappel — Intégration familles</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 12px;color:#111827;font-size:15px">Bonjour,</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6">
        La demande de <strong>${personName}</strong> est inactive depuis <strong>${daysSince} jours</strong>.
      </p>
      <div style="background:#fff7ed;border-left:4px solid #f97316;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 20px">
        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5">${context}</p>
      </div>
      <a href="${appUrl}${link}" style="display:inline-block;background:#5E17EB;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600">
        Voir la demande →
      </a>
      <p style="margin:24px 0 0;color:#6b7280;font-size:13px">
        À bientôt,<br>
        <strong style="color:#111827">L'équipe Koinonia — ${churchName}</strong>
      </p>
    </div>
    <div style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;color:#9ca3af;font-size:11px">Message automatique. Ne pas répondre directement.</p>
    </div>
  </div>
</body>
</html>`;
}
