"use client";

import { SubmitEvent, useState } from "react";
import { BulkActionBar, Button, ConfirmModal, DataTable, Input, Modal, Select, useToast } from "@/components/ui";
import SystemRowActions from "../SystemRowActions";

interface Ministry {
  id: string;
  name: string;
  isSystem: boolean;
  church: { id: string; name: string };
}

interface Props {
  readonly initialMinistries: Ministry[];
  readonly churches: { id: string; name: string }[];
  readonly readOnly?: boolean;
  readonly isSuperAdmin?: boolean;
}

export default function MinistriesClient({
  initialMinistries,
  churches,
  readOnly,
  isSuperAdmin,
}: Props) {
  const [ministries, setMinistries] = useState(initialMinistries);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Ministry | null>(null);
  const [name, setName] = useState("");
  const [churchId, setChurchId] = useState(churches[0]?.id || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkName, setBulkName] = useState("");
  const [bulkChurchId, setBulkChurchId] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  /** Suppression à confirmer : une ligne ou la sélection. */
  const [pendingDelete, setPendingDelete] = useState<Ministry | "selection" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  function openCreate() {
    setEditing(null);
    setName("");
    setChurchId(churches[0]?.id || "");
    setError("");
    setModalOpen(true);
  }

  function openEdit(m: Ministry) {
    setEditing(m);
    setName(m.name);
    setChurchId(m.church.id);
    setError("");
    setModalOpen(true);
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const url = editing
        ? `/api/ministries/${editing.id}`
        : "/api/ministries";
      const method = editing ? "PUT" : "POST";
      const body = editing ? { name } : { name, churchId };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }

      const saved = await res.json();

      if (editing) {
        setMinistries((prev) =>
          prev.map((m) => (m.id === saved.id ? saved : m))
        );
      } else {
        setMinistries((prev) => [...prev, saved]);
      }

      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(m: Ministry) {
    setDeleting(true);

    try {
      const res = await fetch(`/api/ministries/${m.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erreur lors de la suppression");
        return;
      }
      setMinistries((prev) => prev.filter((x) => x.id !== m.id));
      setPendingDelete(null);
      toast.success("Ministère supprimé");
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  }

  async function handleBulkDelete() {
    setDeleting(true);

    try {
      const res = await fetch("/api/ministries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "delete" }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erreur lors de la suppression");
        return;
      }
      setMinistries((prev) => prev.filter((m) => !selectedIds.has(m.id)));
      toast.success(selectedIds.size > 1 ? "Ministères supprimés" : "Ministère supprimé");
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
    setBulkChurchId("");
    setBulkError("");
    setBulkModalOpen(true);
  }

  async function handleBulkEdit(e: SubmitEvent) {
    e.preventDefault();
    const data: Record<string, string> = {};
    if (bulkName) data.name = bulkName;
    if (bulkChurchId) data.churchId = bulkChurchId;

    if (Object.keys(data).length === 0) {
      setBulkError("Remplissez au moins un champ");
      return;
    }

    setBulkLoading(true);
    setBulkError("");

    try {
      const res = await fetch("/api/ministries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "update", data }),
      });

      if (!res.ok) {
        const resp = await res.json();
        throw new Error(resp.error || "Erreur");
      }

      setMinistries((prev) =>
        prev.map((m) => (selectedIds.has(m.id) ? { ...m, ...data, ...(data.churchId ? { church: churches.find((c) => c.id === data.churchId) || m.church } : {}) } : m))
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
      {!readOnly && (
        <div className="mb-4">
          <Button onClick={openCreate}>Créer un ministère</Button>
        </div>
      )}

      <DataTable
          columns={[
            { header: "Nom", accessor: "name" },
            {
              header: "Église",
              accessor: (m: Ministry) => m.church.name,
            },
          ]}
          data={ministries}
          emptyMessage="Aucun ministère."
          selectable={!readOnly}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          actions={readOnly ? undefined : (m) => (
            <SystemRowActions
              isSystem={m.isSystem}
              isSuperAdmin={isSuperAdmin}
              systemLabel="Ministère système"
              onEdit={() => openEdit(m)}
              onDelete={() => setPendingDelete(m)}
            />
          )}
        />

      {!readOnly && (
        <BulkActionBar
          count={selectedIds.size}
          onEdit={openBulkEdit}
          onDelete={() => setPendingDelete("selection")}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Modifier le ministère" : "Créer un ministère"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          {!editing && (
            <Select
              label="Église"
              value={churchId}
              onChange={(e) => setChurchId(e.target.value)}
              options={churches.map((c) => ({ value: c.id, label: c.name }))}
            />
          )}
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
              {loading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title={selectedIds.size > 1 ? `Modifier ${selectedIds.size} ministères` : "Modifier 1 ministère"}
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
          <Select
            label="Église"
            value={bulkChurchId}
            onChange={(e) => setBulkChurchId(e.target.value)}
            placeholder="Ne pas modifier"
            options={churches.map((c) => ({ value: c.id, label: c.name }))}
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
              ? `Supprimer ${selectedIds.size} ministères ?`
              : "Supprimer 1 ministère ?"
            : `Supprimer le ministère « ${pendingDelete?.name ?? ""} » ?`
        }
        message="La suppression est définitive."
        confirmLabel={pendingDelete === "selection" && selectedIds.size > 1 ? "Supprimer les ministères" : "Supprimer le ministère"}
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
