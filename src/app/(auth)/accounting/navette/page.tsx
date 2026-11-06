import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { registry, rolePermissions } from "@/lib/registry";
import { getLedger, getShuttleSettings, listRentals } from "@/modules/shuttle";
import { requireShuttleAccess } from "@/modules/shuttle/auth";
import { ledgerQuerySchema } from "@/modules/shuttle/schemas";
import AccountingNav from "../AccountingNav";
import ShuttleClient, { type ShuttleView } from "./ShuttleClient";

const VIEWS: readonly ShuttleView[] = ["releve", "repartition", "cautions", "locations", "reglages"];

/**
 * Registre de la navette (spec 073), rangé sous la comptabilité : ouvert à la compta
 * (`shuttle:manage`) et à l'équipe navette (fonction de département NAVETTE).
 */
export default async function ShuttlePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;

  let access;
  try {
    access = await requireShuttleAccess(churchId);
  } catch {
    return <p className="p-4 text-ink-muted">Accès non autorisé.</p>;
  }

  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const parsed = ledgerQuerySchema.safeParse({ from: one("du"), to: one("au") });
  const period = parsed.success ? parsed.data : {};
  const view = VIEWS.find((v) => v === one("vue")) ?? "releve";

  const [ledger, rentals, settings] = await Promise.all([
    getLedger(churchId, period, { userId: session.user.id!, manager: access.manager }),
    listRentals(churchId),
    access.manager ? getShuttleSettings(churchId) : Promise.resolve(null),
  ]);

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId).map((r) => r.role);
  const perms = new Set(roles.flatMap((r) => rolePermissions[r] ?? []));
  const canViewRequests = perms.has("accounting:view");
  // Comptes de trésorerie proposés pour un abondement (spec 076), à la compta si le module est actif.
  const treasuryAccounts =
    access.manager && registry.has("treasury")
      ? (await import("@/modules/treasury").then((m) => m.listAccounts(churchId, { includeArchived: false }))).map((a) => ({ id: a.id, name: a.name }))
      : [];
  const canViewTreasury = registry.has("treasury") && perms.has("treasury:manage");

  return (
    <div className="space-y-6">
      {canViewRequests && (
        <AccountingNav
          canViewStats={perms.has("accounting:stats")}
          canViewShuttle
          canViewTreasury={canViewTreasury}
          active="navette"
        />
      )}
      <ShuttleClient
        ledger={ledger}
        rentals={rentals}
        settings={settings}
        manager={access.manager}
        userId={session.user.id!}
        view={view}
        from={period.from}
        to={period.to}
        highlightId={one("ligne")}
        treasuryAccounts={treasuryAccounts}
      />
    </div>
  );
}
