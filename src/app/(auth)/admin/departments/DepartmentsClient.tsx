"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import DataTable from "@/components/ui/DataTable";
import BulkActionBar from "@/components/ui/BulkActionBar";

interface Department {
  id: string;
  name: string;
  isSystem: boolean;
  ministry: { id: string; name: string; churchId: string };
  _count: { members: number };
}

interface Props {
  initialDepartments: Department[];
  ministries: { id: string; name: string; churchName: string }[];
  isSuperAdmin?: boolean;
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

  async function handleSubmit(e: React.FormEvent) {
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
        setDepartments((prev) => [...prev, { ...saved, _count: { members: 0 } }]);
      }

      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(d: Department) {
    if (!confirm(`Supprimer le département "${d.name}" ?`)) return;

    try {
      const res = await fetch(`/api/departments/${d.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      setDepartments((prev) => prev.filter((x) => x.id !== d.id));
    } catch {
      alert("Erreur lors de la suppression");
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Supprimer ${selectedIds.size} département(s) ?`)) return;

    try {
      const res = await fetch("/api/departments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "delete" }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      setDepartments((prev) => prev.filter((d) => !selectedIds.has(d.id)));
      setSelectedIds(new Set());
    } catch {
      alert("Erreur lors de la suppression");
    }
  }

  function openBulkEdit() {
    setBulkName("");
    setBulkMinistryId("");
    setBulkError("");
    setBulkModalOpen(true);
  }

  async function handleBulkEdit(e: React.FormEvent) {
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
        <Button onClick={openCreate}>Nouveau département</Button>
      </div>

      <div className="bg-white rounded-lg shadow">
        <DataTable
          columns={[
            { header: "Nom", accessor: "name" },
            {
              header: "Ministère",
              accessor: (d: Department) => d.ministry.name,
            },
            {
              header: "STAR",
              accessor: (d: Department) => d._count.members,
            },
          ]}
          data={departments}
          emptyMessage="Aucun département."
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          actions={(d) => {
            const locked = d.isSystem && !isSuperAdmin;
            return (
              <div className="flex items-center gap-2 justify-end">
                {d.isSystem && (
                  <span title="Département système" className="text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                )}
                <Button variant="secondary" onClick={() => openEdit(d)} disabled={locked}>
                  Modifier
                </Button>
                <Button variant="danger" onClick={() => handleDelete(d)} disabled={locked}>
                  Supprimer
                </Button>
              </div>
            );
          }}
        />
      </div>

      <BulkActionBar
        count={selectedIds.size}
        onEdit={openBulkEdit}
        onDelete={handleBulkDelete}
        onClear={() => setSelectedIds(new Set())}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Modifier le département" : "Nouveau département"}
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setModalOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title={`Modifier ${selectedIds.size} département(s)`}
      >
        <p className="text-sm text-gray-500 mb-4">
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
          {bulkError && <p className="text-sm text-red-600">{bulkError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setBulkModalOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={bulkLoading}>
              {bulkLoading ? "Enregistrement..." : "Appliquer"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
