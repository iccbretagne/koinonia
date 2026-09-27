import Link from "next/link";
import { Church, Link2 } from "lucide-react";
import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { buttonClasses } from "@/components/ui/button-classes";
import MyPlanningView from "./MyPlanningView";
import { loadMyPlanning } from "./my-planning-data";

export default async function MyPlanningPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) {
    return <EmptyState icon={Church} title="Aucune église sélectionnée" description="Choisissez une église dans le menu." />;
  }
  await requireChurchPermission("planning:view", churchId);

  const data = await loadMyPlanning(session.user.id, churchId);

  if (!data) {
    // User has planning:view but no member link — show empty state
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Mon planning" />
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={Link2}
            title="Aucun compte STAR lié"
            description="Liez votre compte à votre fiche STAR depuis votre profil pour voir vos services."
            action={
              <Link href="/profile" className={buttonClasses("primary")}>
                Gérer mon profil
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const memberName = `${data.member.firstName} ${data.member.lastName}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mon planning" description={memberName} />
      <MyPlanningView plannings={data.plannings} tasksByEvent={data.tasksByEvent} teamEvents={data.teamEvents} />
    </div>
  );
}
