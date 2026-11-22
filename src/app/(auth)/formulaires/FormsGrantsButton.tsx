"use client";

import { useState } from "react";
import { UserPlus, Trash2 } from "lucide-react";
import { Button, ConfirmModal, IconButton, Input, Modal } from "@/components/ui";
import { useApi } from "./use-api";

export interface GrantRow {
  userId: string;
  name: string | null;
  email: string | null;
  grantedBy: string | null;
  createdAt: string;
}

const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

/**
 * « Accès » (spec 085) : comptes autorisés à créer et gérer leurs propres formulaires. Réservé à
 * `forms:manage` (la page n'affiche le bouton qu'à ce droit ; les routes revérifient).
 */
export default function FormsGrantsButton({ grants }: { readonly grants: GrantRow[] }) {
  const { call, busy } = useApi();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string | null; email: string | null }[]>([]);
  const [revoking, setRevoking] = useState<GrantRow | null>(null);
  const granted = new Set(grants.map((g) => g.userId));

  async function search(value: string) {
    setQ(value);
    if (value.trim().length < 2) return setFound([]);
    const res = await fetch(`/api/forms/grants/users?q=${encodeURIComponent(value.trim())}`);
    const data = await res.json().catch(() => ({}));
    setFound(res.ok && Array.isArray(data.data) ? data.data : []);
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" aria-hidden="true" /> Accès
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Accès aux formulaires">
        <div className="space-y-4">
          <p className="text-[14px] text-ink-muted">
            Ces comptes créent et gèrent leurs propres formulaires (et ceux partagés avec eux), sans voir les autres.
          </p>
          {grants.length === 0 && <p className="text-[14px] text-ink-muted">Aucun accès accordé.</p>}
          <ul className="space-y-2">
            {grants.map((g) => (
              <li key={g.userId} className="flex items-center justify-between gap-2 rounded-control border border-line p-3">
                <div>
                  <p className="text-[15px] font-semibold text-ink">{g.name ?? g.email}</p>
                  <p className="text-[13px] text-ink-muted">
                    {g.grantedBy ? `Accordé par ${g.grantedBy}, ` : "Accordé "}le {dateFr(g.createdAt)}
                  </p>
                </div>
                <IconButton icon={Trash2} aria-label={`Retirer l'accès de ${g.name ?? g.email}`} onClick={() => setRevoking(g)} />
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <Input label="Accorder à un compte" placeholder="Nom ou email" value={q} onChange={(e) => void search(e.target.value)} />
            <ul className="space-y-1">
              {found
                .filter((u) => !granted.has(u.id))
                .map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2">
                    <span className="text-[14px] text-ink">
                      {u.name ?? u.email} {u.name && u.email ? <span className="text-ink-muted">({u.email})</span> : null}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={async () => {
                        const done = await call("/api/forms/grants", "POST", { userId: u.id }, "Accès accordé");
                        if (done) {
                          setQ("");
                          setFound([]);
                        }
                      }}
                    >
                      Accorder
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </Modal>
      <ConfirmModal
        open={revoking !== null}
        title="Retirer cet accès ?"
        message="Ses formulaires restent en ligne et ses réponses conservées ; il ne pourra plus les gérer. Ses partages reprennent si l'accès est rendu."
        confirmLabel="Retirer"
        confirming={busy}
        onCancel={() => setRevoking(null)}
        onConfirm={async () => {
          if (revoking) await call(`/api/forms/grants/${revoking.userId}`, "DELETE", undefined, "Accès retiré");
          setRevoking(null);
        }}
      />
    </>
  );
}
