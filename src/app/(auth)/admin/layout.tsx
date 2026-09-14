import { requireAuth, getCurrentChurchId, requireChurchAccess } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (churchId) await requireChurchAccess(churchId);

  return <div className="p-6">{children}</div>;
}
