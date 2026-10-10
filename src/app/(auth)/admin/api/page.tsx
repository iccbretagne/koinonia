import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import PageHeader from "@/components/ui/PageHeader";
import spec from "../../../../../docs/openapi.json";
import ApiReference from "./ApiReference";

/** Référence de l'API (ADR-0023), générée depuis les contrats des routes. Super Admin. */
export default async function ApiDocsPage() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) redirect("/admin");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="API"
        description={`Référence générée depuis les contrats des routes — ${Object.keys(spec.paths).length} adresses, version ${spec.info.version}.`}
      />
      <ApiReference spec={spec} />
    </div>
  );
}
