import type { CateringBoard } from "@/modules/ticketing";
import { formatEuros } from "@/modules/ticketing/schemas";

/** Restauration au tableau de bord : à préparer par plat, stock, non retirés, ventes sur place. */
export default function CateringTab({ board }: { readonly board: CateringBoard }) {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-ink">À préparer</h2>
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {board.toPrepare.map((r) => (
            <li key={r.label} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="font-medium text-ink">{r.label}</span>
              <span className="text-[13px] text-ink-muted">
                {r.paid} payés · {r.due} à régler · remis {r.delivered}
                {r.available !== null ? ` · ${r.available} dispo` : ""}
              </span>
            </li>
          ))}
          {board.toPrepare.length === 0 && <li className="px-4 py-3 text-ink-muted">Aucune option à retirer sur place.</li>}
        </ul>
      </section>
      <p className="text-[15px] text-ink">
        Ventes sur place : {board.sales.quantity} · {formatEuros(board.sales.amount)}
      </p>
      {board.notCollected.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-ink">Non retirés ({board.notCollected.length})</h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {board.notCollected.slice(0, 200).map((n, i) => (
              <li key={`${n.holder}-${n.label}-${i}`} className="flex justify-between gap-2 px-4 py-2 text-[13px]">
                <span className="text-ink">
                  {n.holder} — {n.label}
                  {n.missing > 1 ? ` × ${n.missing}` : ""}
                </span>
                <span className={n.paid ? "text-ink-muted" : "text-warning"}>{n.paid ? "payé" : "à régler"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
