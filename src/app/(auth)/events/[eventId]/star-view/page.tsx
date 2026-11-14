import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { registry } from "@/lib/registry";
import EventFormsBlock from "@/components/forms/EventFormsBlock";
import StarViewClient from "./StarViewClient";

interface Props {
  readonly params: Promise<{ eventId: string }>;
}

export default async function StarViewPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { eventId } = await params;

  // Formulaires de participation rattachés (spec 079, lot 3), pour un compte de l'église.
  let forms: Awaited<ReturnType<typeof import("@/modules/forms").listFormsForEvent>> = [];
  if (registry.has("forms")) {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { churchId: true } });
    const { isChurchMember } = await import("@/modules/forms/auth");
    if (event && isChurchMember(session, event.churchId)) forms = await (await import("@/modules/forms")).listFormsForEvent({ eventId });
  }

  return (
    <>
      {forms.length > 0 && (
        <div className="mb-4">
          <EventFormsBlock forms={forms} />
        </div>
      )}
      <StarViewClient eventId={eventId} />
    </>
  );
}
