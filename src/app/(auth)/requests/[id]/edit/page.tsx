import { notFound } from "next/navigation";
import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Church } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import RequestForm, { type EditData } from "../../new/RequestForm";
import { loadRequestFormData } from "../../request-form-options";

interface Props {
  readonly params: Promise<{ id: string }>;
}

export default async function EditRequestPage({ params }: Props) {
  const { id } = await params;

  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) {
    return <EmptyState icon={Church} title="Aucune église sélectionnée" description="Choisissez une église dans le menu." />;
  }
  await requireChurchPermission("members:view", churchId);

  // Fetch the request with its announcement relation
  const request = await prisma.request.findUnique({
    where: { id },
    include: {
      announcement: {
        select: {
          id: true,
          title: true,
          content: true,
          eventDate: true,
          isSaveTheDate: true,
          isUrgent: true,
          channelInterne: true,
          channelExterne: true,
          targetEvents: { select: { eventId: true } },
        },
      },
    },
  });

  // Only the owner can edit, only EN_ATTENTE requests can be edited
  if (
    request?.submittedById !== session.user.id ||
    request.status !== "EN_ATTENTE"
  ) {
    notFound();
  }

  const { canSubmitDemands, formOptions } = await loadRequestFormData(session, churchId);

  // Build editData for the form
  const editData: EditData = {
    id: request.id,
    type: request.type,
    title: request.title,
    payload: request.payload as Record<string, unknown>,
    announcement: request.announcement
      ? {
          id: request.announcement.id,
          title: request.announcement.title,
          content: request.announcement.content,
          eventDate: request.announcement.eventDate
            ? request.announcement.eventDate.toISOString()
            : null,
          isSaveTheDate: request.announcement.isSaveTheDate,
          isUrgent: request.announcement.isUrgent,
          channelInterne: request.announcement.channelInterne,
          channelExterne: request.announcement.channelExterne,
          targetEvents: request.announcement.targetEvents,
        }
      : null,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Modifier la demande" description="Vous pouvez la modifier tant qu'elle est en attente." />
      <RequestForm
        churchId={churchId}
        canSubmitDemands={canSubmitDemands}
        {...formOptions}
        editData={editData}
      />
    </div>
  );
}
