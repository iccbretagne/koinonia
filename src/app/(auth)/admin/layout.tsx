import { requireAuth, getCurrentChurchId, requireChurchAccess } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (churchId) await requireChurchAccess(churchId);

  // Le padding vient de `<main>` (AuthLayoutShell) — un `p-6` ici le doublait.
  return <>{children}</>;
}
