"use client";

import { SubmitEvent, useState } from "react";
import Link from "next/link";
import { BulkActionBar, Button, ConfirmModal, DataTable, Input, Modal, buttonClasses, useToast } from "@/components/ui";

interface Church {
  id: string;
  name: string;
  slug: string;
  _count: { users: number; ministries: number; events: number };
}

interface Props {
  readonly initialChurches: Church[];
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function ChurchesClient({ initialChurches }: Props) {
  const [churches, setChurches] = useState(initialChurches);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkName, setBulkName] = useState("");
  const [bulkSlug, setBulkSlug] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  /** Suppression à confirmer : une église ou la sélection. */
  const [pendingDelete, setPendingDelete] = useState<Church | "selection" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  function openCreate() {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setError("");
    setModalOpen(true);
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(toSlug(value));
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/churches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }

      const saved = await res.json();
      setChurches((prev) => [
        ...prev,
        { ...saved, _count: { users: 0, ministries: 0, events: 0 } },
      ]);
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(c: Church) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/churches/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erreur lors de la suppression");
        return;
      }
      setChurches((prev) => prev.filter((x) => x.id !== c.id));
      setPendingDelete(null);
      toast.success("Église supprimée");
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  }

  async function handleBulkDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/churches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "delete" }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erreur lors de la suppression");
        return;
      }
      setChurches((prev) => prev.filter((c) => !selectedIds.has(c.id)));
      toast.success(selectedIds.size > 1 ? "Églises supprimées" : "Église supprimée");
      setSelectedIds(new Set());
      setPendingDelete(null);
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  }

  function openBulkEdit() {
    setBulkName("");
    setBulkSlug("");
    setBulkError("");
    setBulkModalOpen(true);
  }

  async function handleBulkEdit(e: SubmitEvent) {
    e.preventDefault();
    const data: Record<string, string> = {};
    if (bulkName) data.name = bulkName;
    if (bulkSlug) data.slug = bulkSlug;

    if (Object.keys(data).length === 0) {
      setBulkError("Remplissez au moins un champ");
      return;
    }

    setBulkLoading(true);
    setBulkError("");

    try {
      const res = await fetch("/api/churches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "update", data }),
      });

      if (!res.ok) {
        const resp = await res.json();
        throw new Error(resp.error || "Erreur");
      }

      setChurches((prev) =>
        prev.map((c) => (selectedIds.has(c.id) ? { ...c, ...data } : c))
      );
      setSelectedIds(new Set());
      setBulkModalOpen(false);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <>
      <div className="mb-4">
        <Button onClick={openCreate}>Créer une église</Button>
      </div>

      <DataTable
          columns={[
            { header: "Nom", accessor: "name" },
            { header: "Slug", accessor: "slug" },
            {
              header: "Utilisateurs",
              accessor: (c: Church) => c._count.users,
            },
            {
              header: "Ministères",
              accessor: (c: Church) => c._count.ministries,
            },
            {
              header: "Événements",
              accessor: (c: Church) => c._count.events,
            },
          ]}
          data={churches}
          emptyMessage="Aucune église."
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          actions={(c) => (
            <div className="flex gap-2 justify-end">
              <Link href={`/admin/churches/${c.id}`} className={`${buttonClasses("ghost", "sm")} min-h-11 sm:min-h-9`}>
                Modifier
              </Link>
              <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setPendingDelete(c)}>
                Supprimer
              </Button>
            </div>
          )}
        />

      <BulkActionBar
        count={selectedIds.size}
        onEdit={openBulkEdit}
        onDelete={() => setPendingDelete("selection")}
        onClear={() => setSelectedIds(new Set())}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nouvelle église"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nom"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
          />
          <Input
            label="Slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            required
            placeholder="généré automatiquement"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setModalOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Création…" : "Créer l'église"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title={selectedIds.size > 1 ? `Modifier ${selectedIds.size} églises` : "Modifier 1 église"}
      >
        <p className="text-sm text-ink-muted mb-4">
          Seuls les champs remplis seront modifiés.
        </p>
        <form onSubmit={handleBulkEdit} className="space-y-4">
          <Input
            label="Nom"
            value={bulkName}
            onChange={(e) => setBulkName(e.target.value)}
            placeholder="Laisser vide pour ne pas modifier"
          />
          <Input
            label="Slug"
            value={bulkSlug}
            onChange={(e) => setBulkSlug(e.target.value)}
            placeholder="Laisser vide pour ne pas modifier"
          />
          {bulkError && <p className="text-sm text-danger">{bulkError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setBulkModalOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={bulkLoading}>
              {bulkLoading ? "Enregistrement…" : "Appliquer"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={pendingDelete !== null}
        title={
          pendingDelete === "selection"
            ? selectedIds.size > 1
              ? `Supprimer ${selectedIds.size} églises ?`
              : "Supprimer 1 église ?"
            : `Supprimer l'église « ${pendingDelete?.name ?? ""} » ?`
        }
        message="La suppression est définitive."
        confirmLabel={pendingDelete === "selection" && selectedIds.size > 1 ? "Supprimer les églises" : "Supprimer l'église"}
        confirmingLabel="Suppression…"
        confirming={deleting}
        onConfirm={() => {
          if (pendingDelete === "selection") void handleBulkDelete();
          else if (pendingDelete) void handleDelete(pendingDelete);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
