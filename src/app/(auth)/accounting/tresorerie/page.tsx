import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { registry, rolePermissions } from "@/lib/registry";
import {
  budgetVsActual,
  getBudget,
  getDashboard,
  getLedger,
  getReports,
  listAccounts,
  listCategories,
  listChequesInHand,
  listClosures,
  listCollectionServices,
  listPurposes,
  listReopenings,
} from "@/modules/treasury";
import { requireTreasuryAccess } from "@/modules/treasury/auth";
import { ledgerQuerySchema, periodQuerySchema } from "@/modules/treasury/schemas";
import AccountingNav from "../AccountingNav";
import TreasuryClient from "./TreasuryClient";
import { TREASURY_TABS, type TreasuryTab } from "./tabs";

/**
 * Trésorerie de l'église (spec 076), rangée sous la comptabilité : Comptable, Admin, Super Admin.
 * Chaque onglet charge ses données côté serveur ; les écritures passent par l'API puis
 * rafraîchissent la page.
 */
export default async function TreasuryPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;
  let access;
  try {
    access = await requireTreasuryAccess(churchId);
  } catch {
    return <p className="p-4 text-ink-muted">Accès non autorisé.</p>;
  }

  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const tab: TreasuryTab = TREASURY_TABS.find((t) => t === one("onglet")) ?? "tableau";

  const [accounts, categories, purposes] = await Promise.all([
    listAccounts(churchId),
    listCategories(churchId),
    listPurposes(churchId),
  ]);

  const now = new Date();
  const year = Number(one("annee")) || now.getFullYear();
  const ledgerQuery = ledgerQuerySchema.safeParse({
    accountId: one("compte"),
    from: one("du"),
    to: one("au"),
    categoryId: one("categorie"),
    method: one("moyen"),
  });
  const period = periodQuerySchema.safeParse({ from: one("du"), to: one("au") });

  const data = {
    dashboard: tab === "tableau" ? await getDashboard(churchId) : null,
    ledger: tab === "registre" ? await getLedger(churchId, ledgerQuery.success ? ledgerQuery.data : {}) : null,
    reports:
      tab === "rapports" ? await getReports(churchId, period.success ? period.data.from : undefined, period.success ? period.data.to : undefined) : null,
    services: tab === "collecte" ? await listCollectionServices(churchId) : [],
    cheques: tab === "remise" ? await listChequesInHand(churchId) : [],
    budget:
      tab === "budget"
        ? {
            year,
            rows: await getBudget(churchId, year),
            comparison: await budgetVsActual(churchId, year, year === now.getFullYear() ? now.getMonth() + 1 : 12),
          }
        : null,
    closures: tab === "cloture" ? { closures: await listClosures(churchId), reopenings: await listReopenings(churchId) } : null,
    closureLedger:
      tab === "cloture"
        ? await getLedger(churchId, (() => {
            const m = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const last = new Date(now.getFullYear(), now.getMonth(), 0);
            const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            return { from: iso(m), to: iso(last) };
          })())
        : null,
  };

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId).map((r) => r.role);
  const perms = new Set(roles.flatMap((r) => rolePermissions[r] ?? []));
  const { isShuttleVisible } = await import("@/modules/shuttle/auth");
  const canViewShuttle = registry.has("shuttle") && (await isShuttleVisible(session, churchId));

  return (
    <div className="space-y-6">
      <AccountingNav
        canViewStats={perms.has("accounting:stats") || !!session.user.isSuperAdmin}
        canViewRequests={perms.has("accounting:view") || !!session.user.isSuperAdmin}
        canViewShuttle={canViewShuttle}
        canViewTreasury
        active="tresorerie"
      />
      <TreasuryClient
        tab={tab}
        accounts={accounts}
        categories={categories}
        purposes={purposes}
        canReopen={access.canReopen}
        data={data}
        filters={{
          accountId: one("compte"),
          from: one("du"),
          to: one("au"),
          categoryId: one("categorie"),
          method: one("moyen"),
        }}
        highlightId={one("ligne")}
      />
    </div>
  );
}
