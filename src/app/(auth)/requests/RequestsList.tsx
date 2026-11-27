"use client";

import { createElement, useState } from "react";
import Link from "next/link";
import { Inbox, Pencil, Plus, SearchX } from "lucide-react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";
import EmptyState from "@/components/ui/EmptyState";
import FilterChip from "@/components/ui/FilterChip";
import SearchInput from "@/components/ui/SearchInput";
import Select from "@/components/ui/Select";
import StatusChip from "@/components/ui/StatusChip";
import { buttonClasses } from "@/components/ui/button-classes";
import { useToast } from "@/components/ui/Toast";
import { REQUEST_TYPE_LABEL as TYPE_LABEL, requestStatus, requestTypeIcon } from "./request-display";
import { formatAssignedDepts, type DeptFunction } from "@/lib/department-functions";
import { paths } from "@/lib/paths";

const ANNOUNCEMENT_TYPES = new Set(["VISUEL", "DIFFUSION_INTERNE", "RESEAUX_SOCIAUX"]);

type FilterCategory = "all" | "announcements" | "demands";

interface RequestItem {
  id: string;
  type: string;
  status: string;
  title: string;
  payload: unknown;
  reviewNotes: string | null;
  executionError: string | null;
  submittedAt: Date;
  department: { id: string; name: string } | null;
  ministry: { id: string; name: string } | null;
  assignedFunction: DeptFunction;
  assignedDepts: { id: string; name: string }[];
  announcement: {
    id: string;
    title: string;
    content: string;
    status: string;
    eventDate: Date | null;
    isSaveTheDate: boolean;
  } | null;
  childRequests: {
    id: string;
    type: string;
    status: string;
    payload: unknown;
    assignedFunction: DeptFunction;
    assignedDepts: { id: string; name: string }[];
  }[];
  reviewedBy: { id: string; name: string | null; displayName: string | null } | null;
}

interface Props {
  readonly requests: RequestItem[];
}

function RequestCard({ req, onUpdated }: { readonly req: RequestItem; readonly onUpdated: (updated: Partial<RequestItem>) => void }) {
  const toast = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const announcementContent = req.announcement?.content ?? null;
  const PREVIEW_LENGTH = 150;
  const isLong = announcementContent !== null && announcementContent.length > PREVIEW_LENGTH;

  const source = req.department?.name ?? req.ministry?.name ?? null;
  const isPending = req.status === "EN_ATTENTE";
  const status = requestStatus(req.status);

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ANNULE" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Annulation impossible. Réessayez dans un instant.");
      }
      onUpdated({ status: "ANNULE" });
      setConfirmOpen(false);
      toast.success("Demande annulée");
    } catch (e) {
      setCancelling(false);
      setConfirmOpen(false);
      toast.error((e as Error).message);
    }
  }

  return (
    <li className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text">
          {createElement(requestTypeIcon(req.type), { "aria-hidden": true, className: "size-5", strokeWidth: 1.75 })}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[11px] font-bold uppercase leading-4 tracking-[0.06em] text-ink-muted">
            {TYPE_LABEL[req.type] ?? req.type}
          </p>
          <h3 className="break-words font-sans text-[15px] font-semibold leading-[22px] text-ink">
            {req.announcement ? req.announcement.title : req.title}
          </h3>
          <p className="text-[13px] leading-[18px] text-ink-muted">
            {source && <>{source} · </>}pour {formatAssignedDepts(req.assignedFunction, req.assignedDepts)} ·{" "}
            {new Date(req.submittedAt).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <StatusChip tone={status.tone} className="shrink-0">{status.label}</StatusChip>
      </div>

      <div className="flex flex-col gap-2 sm:pl-[52px]">
        {announcementContent && (
          <div>
            <p className="whitespace-pre-wrap text-[15px] leading-[22px] text-ink-muted">
              {isLong && !expanded
                ? `${announcementContent.slice(0, PREVIEW_LENGTH).trimEnd()}…`
                : announcementContent}
            </p>
            {isLong && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="-ml-3 mt-1"
              >
                {expanded ? "Réduire le texte" : "Lire la suite"}
              </Button>
            )}
          </div>
        )}

        {req.childRequests.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {req.childRequests.map((child) => {
              const childStatus = requestStatus(child.status);
              return (
                <li key={child.id} className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
                  <StatusChip tone={childStatus.tone}>{childStatus.label}</StatusChip>
                  <span className="font-semibold text-ink">{TYPE_LABEL[child.type] ?? child.type}</span>
                  <span>pour {formatAssignedDepts(child.assignedFunction, child.assignedDepts)}</span>
                </li>
              );
            })}
          </ul>
        )}

        {(req.status === "REFUSEE" || req.status === "ERREUR") && req.reviewNotes && (
          <Alert tone="danger" title="Note :">{req.reviewNotes}</Alert>
        )}
        {req.status === "ERREUR" && req.executionError && (
          <Alert tone="danger" title="Erreur :">{req.executionError}</Alert>
        )}

        {isPending && (
          <div className="flex flex-wrap gap-2">
            <Link href={paths.requests.edit(req.id)} className={buttonClasses("secondary", "sm")}>
              <Pencil aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Modifier la demande
            </Link>
            <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)} disabled={cancelling}>
              {cancelling ? "Annulation…" : "Annuler la demande"}
            </Button>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Annuler cette demande ?"
        message="La demande sera définitivement annulée : il faudra en créer une nouvelle pour la relancer."
        confirmLabel="Annuler la demande"
        cancelLabel="Garder la demande"
        confirmingLabel="Annulation…"
        variant="danger"
        confirming={cancelling}
        onConfirm={handleCancel}
        onCancel={() => setConfirmOpen(false)}
      />
    </li>
  );
}

export default function RequestsList({ requests }: Props) {
  const [items, setItems] = useState<RequestItem[]>(requests);
  const [category, setCategory] = useState<FilterCategory>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  function handleUpdated(id: string, patch: Partial<RequestItem>) {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const filtered = items.filter((r) => {
    if (category === "announcements" && !ANNOUNCEMENT_TYPES.has(r.type)) return false;
    if (category === "demands" && ANNOUNCEMENT_TYPES.has(r.type)) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (typeFilter !== "all" && r.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = [
        r.announcement?.title ?? r.title,
        r.announcement?.content ?? "",
        r.department?.name ?? r.ministry?.name ?? "",
        r.assignedDepts.map((d) => d.name).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // Types et statuts réellement présents : un filtre ne propose que des valeurs qui ramènent
  // quelque chose, et reste utile quand la liste s'allonge.
  const statuses = Array.from(new Set(items.map((r) => r.status)));
  const types = Array.from(new Set(items.map((r) => r.type)));
  const hasFilters = category !== "all" || statusFilter !== "all" || typeFilter !== "all" || search.trim() !== "";

  function resetFilters() {
    setCategory("all");
    setStatusFilter("all");
    setTypeFilter("all");
    setSearch("");
  }

  if (items.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface">
        <EmptyState
          icon={Inbox}
          title="Aucune demande envoyée"
          description="Annonce, visuel, événement ou accès : faites votre première demande."
          action={
            <Link href={paths.requests.newRequest()} className={buttonClasses("primary")}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Nouvelle demande
            </Link>
          }
        />
      </div>
    );
  }

  const categories: { value: FilterCategory; label: string }[] = [
    { value: "all", label: "Tout" },
    { value: "announcements", label: "Annonces" },
    { value: "demands", label: "Demandes" },
  ];

  return (
    <section aria-label="Demandes envoyées" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <div role="group" aria-label="Catégorie" className="flex min-w-0 flex-wrap gap-2">
          {categories.map((cat) => (
            <FilterChip key={cat.value} pressed={category === cat.value} onClick={() => setCategory(cat.value)}>
              {cat.label}
            </FilterChip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:contents">
          <div className="md:w-48">
            <Select
              label="Type"
              hideLabel
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              options={[{ value: "all", label: "Tous types" }, ...types.map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t }))]}
            />
          </div>
          <div className="md:w-44">
            <Select
              label="Statut"
              hideLabel
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[{ value: "all", label: "Tous statuts" }, ...statuses.map((st) => ({ value: st, label: requestStatus(st).label }))]}
            />
          </div>
        </div>
        <div className="min-w-[12rem] flex-1">
          <SearchInput
            aria-label="Rechercher une demande"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un titre, un département…"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] leading-[18px] text-ink-muted" aria-live="polite">
          {filtered.length} demande{filtered.length > 1 ? "s" : ""}
          {hasFilters && ` sur ${items.length}`}
        </p>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Effacer les filtres
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-line bg-surface shadow-card">
          <EmptyState
            icon={SearchX}
            title="Aucune demande pour ces filtres"
            action={
              <Button variant="secondary" onClick={resetFilters}>
                Effacer les filtres
              </Button>
            }
            size="sm"
          />
        </div>
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {filtered.map((req) => (
            <RequestCard key={req.id} req={req} onUpdated={(patch) => handleUpdated(req.id, patch)} />
          ))}
        </ul>
      )}
    </section>
  );
}
