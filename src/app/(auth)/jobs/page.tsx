import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { loadJobsBoard } from "@/modules/jobs";
import JobsBoard from "./JobsBoard";
import PublishChooser from "./PublishChooser";
import { resolveInitialView } from "./board";

export default async function JobsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { tab } = await searchParams;
  const view = resolveInitialView(tab);
  const now = new Date();
  const board = await loadJobsBoard(session, { now });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Offres"
        description="Emplois, stages, alternances, missions et profils de la communauté"
        actions={<PublishChooser />}
      />
      <JobsBoard
        key={view.tab}
        publications={board.publications}
        canManage={board.canManage}
        lastSeenAt={board.lastSeenAt}
        nowMs={now.getTime()}
        tab={view.tab}
        initialChips={view.chips}
      />
    </div>
  );
}
