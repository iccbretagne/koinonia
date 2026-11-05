"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Select, StatusChip, useToast } from "@/components/ui";
import type { AccountView, CategoryView, PurposeView } from "@/modules/treasury";
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABEL } from "@/modules/treasury/schemas";
import type { TreasuryAccountKind } from "@/generated/prisma/enums";
import { api, errorText, euro, frDate, isoToday, toNumber } from "./format";

function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast.success(done);
      router.refresh();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function AccountForm({ account, onDone }: { readonly account?: AccountView; readonly onDone?: () => void }) {
  const { busy, error, run } = useAction();
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<TreasuryAccountKind>(account?.kind ?? "CASH");
  const [balance, setBalance] = useState(account ? String(account.openingBalance).replace(".", ",") : "");
  const [date, setDate] = useState(account?.openingDate ?? isoToday());

  const submitLabel = account ? "Enregistrer" : "Créer le compte";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const json = { name, kind, openingBalance: toNumber(balance || "0"), openingDate: date };
    const ok = await run(
      () => api(account ? `/api/accounting/tresorerie/accounts/${account.id}` : "/api/accounting/tresorerie/accounts", { method: account ? "PATCH" : "POST", json }),
      account ? "Compte modifié" : "Compte créé"
    );
    if (ok) {
      if (!account) {
        setName("");
        setBalance("");
      }
      onDone?.();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Nom" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Caisse principale" />
        <Select label="Nature" value={kind} onChange={(e) => setKind(e.target.value as TreasuryAccountKind)} options={ACCOUNT_KINDS.map((k) => ({ value: k, label: ACCOUNT_KIND_LABEL[k] }))} />
        <Input label="Solde de départ (€)" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0,00" />
        <Input label="Au" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" disabled={busy}>{busy ? "Enregistrement…" : submitLabel}</Button>
    </form>
  );
}

function AccountRow({ account }: { readonly account: AccountView }) {
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState(false);
  return (
    <li className="space-y-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">{account.name}</span>
        <StatusChip tone="neutral">{ACCOUNT_KIND_LABEL[account.kind]}</StatusChip>
        {account.archived && <StatusChip tone="warning">Archivé</StatusChip>}
        <span className="text-sm text-ink-muted">Départ : {euro(account.openingBalance)} au {frDate(account.openingDate)}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>{editing ? "Fermer" : "Modifier"}</Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => run(() => api(`/api/accounting/tresorerie/accounts/${account.id}`, { method: "PATCH", json: { archived: !account.archived } }), account.archived ? "Compte réactivé" : "Compte archivé")}
          >
            {account.archived ? "Réactiver" : "Archiver"}
          </Button>
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {editing && <AccountForm account={account} onDone={() => setEditing(false)} />}
    </li>
  );
}

function NamedList({
  title,
  items,
  base,
  extra,
}: {
  readonly title: string;
  readonly items: { id: string; name: string; active: boolean; system?: string | null }[];
  readonly base: string;
  readonly extra?: Record<string, unknown>;
}) {
  const { busy, error, run } = useAction();
  const [name, setName] = useState("");
  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="mb-2 text-lg font-semibold text-ink">{title}</h2>
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className={i.active ? "text-ink" : "text-ink-subtle line-through"}>{i.name}</span>
            {i.system && <StatusChip tone="info">Utilisée par Koinonia</StatusChip>}
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => api(`${base}/${i.id}`, { method: "PATCH", json: { active: !i.active } }), i.active ? "Désactivée" : "Réactivée")}>
                {i.active ? "Désactiver" : "Réactiver"}
              </Button>
              {!i.system && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => api(`${base}/${i.id}`, { method: "DELETE" }), "Supprimée")}>
                  Supprimer
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api(base, { method: "POST", json: { name, ...extra } }), "Ajoutée")) setName("");
        }}
      >
        <Input label="Ajouter" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={busy}>Ajouter</Button>
      </form>
      {error && <div className="mt-2"><Alert tone="danger">{error}</Alert></div>}
    </section>
  );
}

/** Réglages : comptes de trésorerie, catégories et objets des offrandes spéciales. */
export default function SettingsTab({
  accounts,
  categories,
  purposes,
  firstRun = false,
}: {
  readonly accounts: AccountView[];
  readonly categories: CategoryView[];
  readonly purposes: PurposeView[];
  readonly firstRun?: boolean;
}) {
  return (
    <div className="space-y-6">
      {firstRun && (
        <Alert tone="info" title="Commencez par vos comptes">
          Créez la caisse principale (et les autres comptes de l&apos;église) avec leur solde actuel : c&apos;est le point de départ de la trésorerie.
        </Alert>
      )}
      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-2 text-lg font-semibold text-ink">Comptes de trésorerie</h2>
        <p className="mb-3 text-sm text-ink-muted">L&apos;argent que l&apos;église détient elle-même. Le compte bancaire commun n&apos;est pas suivi ici.</p>
        {accounts.length > 0 && (
          <ul className="mb-4 divide-y divide-line">
            {accounts.map((a) => <AccountRow key={a.id} account={a} />)}
          </ul>
        )}
        <h3 className="mb-2 font-semibold text-ink">Nouveau compte</h3>
        <AccountForm />
      </section>
      {!firstRun && (
        <div className="grid gap-6 lg:grid-cols-3">
          <NamedList title="Catégories d'entrées" base="/api/accounting/tresorerie/categories" extra={{ direction: "IN" }} items={categories.filter((c) => c.direction === "IN")} />
          <NamedList title="Catégories de sorties" base="/api/accounting/tresorerie/categories" extra={{ direction: "OUT" }} items={categories.filter((c) => c.direction === "OUT")} />
          <NamedList title="Objets des offrandes spéciales" base="/api/accounting/tresorerie/purposes" items={purposes} />
        </div>
      )}
    </div>
  );
}
