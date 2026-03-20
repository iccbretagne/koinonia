"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import DataTable from "@/components/ui/DataTable";
import BulkActionBar from "@/components/ui/BulkActionBar";

interface Ministry {
  id: string;
  name: string;
  isSystem: boolean;
  church: { id: string; name: string };
}

interface Props {
  initialMinistries: Ministry[];
  churches: { id: string; name: string }[];
  readOnly?: boolean;
  isSuperAdmin?: boolean;
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

  async function handleSubmit(e: React.FormEvent) {
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
    if (!confirm(`Supprimer le ministère "${m.name}" ?`)) return;

    try {
      const res = await fetch(`/api/ministries/${m.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      setMinistries((prev) => prev.filter((x) => x.id !== m.id));
    } catch {
      alert("Erreur lors de la suppression");
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Supprimer ${selectedIds.size} ministère(s) ?`)) return;

    try {
      const res = await fetch("/api/ministries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "delete" }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      setMinistries((prev) => prev.filter((m) => !selectedIds.has(m.id)));
      setSelectedIds(new Set());
    } catch {
      alert("Erreur lors de la suppression");
    }
  }

  function openBulkEdit() {
    setBulkName("");
    setBulkChurchId("");
    setBulkError("");
    setBulkModalOpen(true);
  }

  async function handleBulkEdit(e: React.FormEvent) {
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
          <Button onClick={openCreate}>Nouveau ministère</Button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
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
          actions={readOnly ? undefined : (m) => {
            const locked = m.isSystem && !isSuperAdmin;
            return (
              <div className="flex items-center gap-2 justify-end">
                {m.isSystem && (
                  <span title="Ministère système" className="text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                )}
                <Button variant="secondary" onClick={() => openEdit(m)} disabled={locked}>
                  Modifier
                </Button>
                <Button variant="danger" onClick={() => handleDelete(m)} disabled={locked}>
                  Supprimer
                </Button>
              </div>
            );
          }}
        />
      </div>

      {!readOnly && (
        <BulkActionBar
          count={selectedIds.size}
          onEdit={openBulkEdit}
          onDelete={handleBulkDelete}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Modifier le ministère" : "Nouveau ministère"}
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
        title={`Modifier ${selectedIds.size} ministère(s)`}
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
            label="Église"
            value={bulkChurchId}
            onChange={(e) => setBulkChurchId(e.target.value)}
            placeholder="Ne pas modifier"
            options={churches.map((c) => ({ value: c.id, label: c.name }))}
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
