import { requireAnyPermission } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAnyPermission(
    "members:manage",
    "members:view",
    "church:manage",
    "users:manage",
    "departments:manage",
    "events:manage",
    "discipleship:view"
  );

  return <div className="p-6">{children}</div>;
}
