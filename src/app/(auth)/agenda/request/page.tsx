import { requireChurchPermission, getCurrentChurchId } from "@/lib/auth";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RequestForm from "./RequestForm";

export default async function AgendaRequestPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  const [church, memberLink] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId }, select: { name: true } }),
    prisma.memberUserLink.findUnique({
      where: { userId_churchId: { userId: session.user.id, churchId } },
      select: {
        validatedAt: true,
        member: {
          select: {
            departments: { include: { department: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  const isStar = memberLink?.validatedAt ? "Oui" : "";
  const department = isStar
    ? memberLink!.member.departments.map((d) => d.department.name).join(", ")
    : "";

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Demande de RDV pastoral</h1>
      <p className="text-sm text-gray-500 mb-6">
        Soumettez votre demande. Un qualificateur la traitera et vous sera assigné un créneau.
      </p>
      <RequestForm
        churchId={churchId}
        churchName={church?.name ?? "votre église"}
        defaultFirstName={session.user.name?.split(" ")[0] ?? ""}
        defaultLastName={session.user.name?.split(" ").slice(1).join(" ") ?? ""}
        defaultEmail={session.user.email ?? ""}
        defaultIsStar={isStar}
        defaultDepartment={department}
      />
    </div>
  );
}
