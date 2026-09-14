import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import StarViewClient from "./StarViewClient";

interface Props {
  readonly params: Promise<{ eventId: string }>;
}

export default async function StarViewPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { eventId } = await params;

  return <StarViewClient eventId={eventId} />;
}
