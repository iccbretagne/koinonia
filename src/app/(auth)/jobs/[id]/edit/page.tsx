import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import JobFormClient from "../../new/JobFormClient";
import { paths } from "@/lib/paths";

export default async function EditJobPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { id } = await params;

  const job = await prisma.jobOffer.findUnique({
    where: { id },
    select: {
      id: true, title: true, type: true, company: true, location: true,
      description: true, duration: true, deadline: true,
      contactEmail: true, contactUrl: true, authorId: true,
    },
  });

  if (!job) notFound();
  if (job.authorId !== session.user.id) redirect(paths.jobs.offer(id));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title="Modifier l&apos;offre" />
      <JobFormClient
        initial={{
          ...job,
          deadline: job.deadline ? job.deadline.toISOString() : null,
        }}
      />
    </div>
  );
}
