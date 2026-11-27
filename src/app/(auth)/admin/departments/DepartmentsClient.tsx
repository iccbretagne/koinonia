"use client";

import { SubmitEvent, useState } from "react";
import { BulkActionBar, Button, ConfirmModal, DataTable, Input, Modal, Select, useToast } from "@/components/ui";
import SystemRowActions from "../SystemRowActions";

interface Department {
  id: string;
  name: string;
  isSystem: boolean;
  ministry: { id: string; name: string; churchId: string };
  _count: { memberDepts: number };
}

interface Props {
  readonly initialDepartments: Department[];
  readonly ministries: { id: string; name: string; churchName: string }[];
  readonly isSuperAdmin?: boolean;
}

export default function DepartmentsClient({
  initialDepartments,
  ministries,
  isSuperAdmin,
}: Props) {
  const [departments, setDepartments] = useState(initialDepartments);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [name, setName] = useState("");
  const [ministryId, setMinistryId] = useState(ministries[0]?.id || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkName, setBulkName] = useState("");
  const [bulkMinistryId, setBulkMinistryId] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  /** Suppression à confirmer : une ligne ou la sélection. */
  const [pendingDelete, setPendingDelete] = useState<Department | "selection" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  function openCreate() {
    setEditing(null);
    setName("");
    setMinistryId(ministries[0]?.id || "");
    setError("");
    setModalOpen(true);
  }

  function openEdit(d: Department) {
    setEditing(d);
    setName(d.name);
    setMinistryId(d.ministry.id);
    setError("");
    setModalOpen(true);
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const url = editing
        ? `/api/departments/${editing.id}`
        : "/api/departments";
      const method = editing ? "PUT" : "POST";
      const body = { name, ministryId };

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
        setDepartments((prev) =>
          prev.map((d) =>
            d.id === saved.id ? { ...saved, _count: d._count } : d
          )
        );
      } else {
        setDepartments((prev) => [...prev, { ...saved, _count: { memberDepts: 0 } }]);
      }

      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(d: Department) {
    setDeleting(true);

    try {
      const res = await fetch(`/api/departments/${d.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erreur lors de la suppression");
        return;
      }
      setDepartments((prev) => prev.filter((x) => x.id !== d.id));
      setPendingDelete(null);
      toast.success("Département supprimé");
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  }

  async function handleBulkDelete() {
    setDeleting(true);

    try {
      const res = await fetch("/api/departments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "delete" }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erreur lors de la suppression");
        return;
      }
      setDepartments((prev) => prev.filter((d) => !selectedIds.has(d.id)));
      toast.success(selectedIds.size > 1 ? "Départements supprimés" : "Département supprimé");
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
    setBulkMinistryId("");
    setBulkError("");
    setBulkModalOpen(true);
  }

  async function handleBulkEdit(e: SubmitEvent) {
    e.preventDefault();
    const data: Record<string, string> = {};
    if (bulkName) data.name = bulkName;
    if (bulkMinistryId) data.ministryId = bulkMinistryId;

    if (Object.keys(data).length === 0) {
      setBulkError("Remplissez au moins un champ");
      return;
    }

    setBulkLoading(true);
    setBulkError("");

    try {
      const res = await fetch("/api/departments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "update", data }),
      });

      if (!res.ok) {
        const resp = await res.json();
        throw new Error(resp.error || "Erreur");
      }

      setDepartments((prev) =>
        prev.map((d) => {
          if (!selectedIds.has(d.id)) return d;
          const updated = { ...d, ...data };
          if (data.ministryId) {
            const m = ministries.find((m) => m.id === data.ministryId);
            if (m) updated.ministry = { id: m.id, name: m.name, churchId: d.ministry.churchId };
          }
          return updated;
        })
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
        <Button onClick={openCreate}>Créer un département</Button>
      </div>

      <DataTable
          columns={[
            { header: "Nom", accessor: "name" },
            {
              header: "Ministère",
              accessor: (d: Department) => d.ministry.name,
            },
            {
              header: "STAR",
              accessor: (d: Department) => d._count.memberDepts,
            },
          ]}
          data={departments}
          emptyMessage="Aucun département."
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          actions={(d) => (
            <SystemRowActions
              isSystem={d.isSystem}
              isSuperAdmin={isSuperAdmin}
              systemLabel="Département système"
              onEdit={() => openEdit(d)}
              onDelete={() => setPendingDelete(d)}
            />
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
        title={editing ? "Modifier le département" : "Créer un département"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Select
            label="Ministère"
            value={ministryId}
            onChange={(e) => setMinistryId(e.target.value)}
            options={ministries.map((m) => ({
              value: m.id,
              label: `${m.name} (${m.churchName})`,
            }))}
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
              {loading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title={selectedIds.size > 1 ? `Modifier ${selectedIds.size} départements` : "Modifier 1 département"}
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
            label="Ministère"
            value={bulkMinistryId}
            onChange={(e) => setBulkMinistryId(e.target.value)}
            placeholder="Ne pas modifier"
            options={ministries.map((m) => ({
              value: m.id,
              label: `${m.name} (${m.churchName})`,
            }))}
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
              ? `Supprimer ${selectedIds.size} départements ?`
              : "Supprimer 1 département ?"
            : `Supprimer le département « ${pendingDelete?.name ?? ""} » ?`
        }
        message="La suppression est définitive."
        confirmLabel={pendingDelete === "selection" && selectedIds.size > 1 ? "Supprimer les départements" : "Supprimer le département"}
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
