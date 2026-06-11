import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import JobFormClient from "../../new/JobFormClient";

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
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
  if (job.authorId !== session.user.id) redirect(`/jobs/${id}`);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Modifier l&apos;offre</h1>
      <JobFormClient
        initial={{
          ...job,
          deadline: job.deadline ? job.deadline.toISOString() : null,
        }}
      />
    </div>
  );
}
