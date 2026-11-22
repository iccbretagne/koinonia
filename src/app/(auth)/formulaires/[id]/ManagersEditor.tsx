"use client";

import { useState } from "react";
import { Share2, Trash2 } from "lucide-react";
import { Button, IconButton, Select } from "@/components/ui";
import { useApi } from "../use-api";

export interface Manager {
  userId: string;
  name: string | null;
  addedBy: string | null;
}

/**
 * Partage du formulaire (spec 085) : les co-gestionnaires font tout sauf le supprimer et gérer ce
 * partage. L'auteur (et la gestion) modifie la liste ; un co-gestionnaire la consulte seulement.
 */
export default function ManagersEditor({
  formId,
  editable,
  managers,
  candidates,
}: {
  readonly formId: string;
  readonly editable: boolean;
  readonly managers: Manager[];
  readonly candidates: { id: string; name: string }[];
}) {
  const { call, busy } = useApi();
  const [adding, setAdding] = useState("");
  const taken = new Set(managers.map((m) => m.userId));

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold text-ink">Partage</h2>
        <p className="text-[14px] text-ink-muted">
          Les personnes avec qui vous partagez ce formulaire peuvent le gérer, sauf le supprimer et gérer ce partage.
        </p>
      </div>
      {managers.length === 0 && <p className="text-[14px] text-ink-muted">Formulaire non partagé.</p>}
      <ul className="space-y-2">
        {managers.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2 rounded-control border border-line p-3">
            <p className="text-[15px] text-ink">{m.name}</p>
            {editable && (
              <IconButton
                icon={Trash2}
                aria-label={`Retirer ${m.name}`}
                disabled={busy}
                onClick={() => void call(`/api/forms/${formId}/managers/${m.userId}`, "DELETE", undefined, "Partage retiré")}
              />
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-72">
            <Select
              label="Partager avec"
              placeholder="Choisir un compte…"
              value={adding}
              options={candidates.filter((c) => !taken.has(c.id)).map((c) => ({ value: c.id, label: c.name }))}
              onChange={(e) => setAdding(e.target.value)}
              hint="Comptes ayant l'accès aux formulaires."
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !adding}
            onClick={async () => {
              const done = await call(`/api/forms/${formId}/managers`, "POST", { userId: adding }, "Formulaire partagé");
              if (done) setAdding("");
            }}
          >
            <Share2 className="size-4" aria-hidden="true" /> Partager
          </Button>
        </div>
      )}
    </section>
  );
}
