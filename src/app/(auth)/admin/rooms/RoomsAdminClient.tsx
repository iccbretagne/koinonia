"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Alert, Button, DataTable, IconButton, Input, Modal, Select, StatusChip, useToast } from "@/components/ui";

interface Room {
  id: string;
  name: string;
  capacity: number | null;
  location: string | null;
  isActive: boolean;
  reservationCount: number;
  sharedWith: { id: string; church: { id: string; name: string } }[];
}

interface Church {
  id: string;
  name: string;
}

export default function RoomsAdminClient({
  churchId,
  initialRooms,
  otherChurches,
}: {
  readonly churchId: string;
  readonly initialRooms: Room[];
  readonly otherChurches: Church[];
}) {
  const router = useRouter();
  const [rooms, setRooms] = useState(initialRooms);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accessRoom, setAccessRoom] = useState<Room | null>(null);
  const [newAccessChurch, setNewAccessChurch] = useState("");

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const toast = useToast();

  const displayedRooms = useMemo(() => {
    let list = rooms;
    if (statusFilter === "active") list = list.filter((r) => r.isActive);
    if (statusFilter === "inactive") list = list.filter((r) => !r.isActive);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [rooms, statusFilter]);

  function openCreate() {
    setEditing(null);
    setName("");
    setCapacity("");
    setLocation("");
    setError(null);
    setFormOpen(true);
  }

  function openEdit(room: Room) {
    setEditing(room);
    setName(room.name);
    setCapacity(room.capacity?.toString() ?? "");
    setLocation(room.location ?? "");
    setError(null);
    setFormOpen(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const res = await fetch(`/api/rooms/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            capacity: capacity ? Number(capacity) : null,
            location: location || null,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
        const updated = await res.json();
        setRooms((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      } else {
        const res = await fetch("/api/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            churchId,
            name,
            capacity: capacity ? Number(capacity) : undefined,
            location: location || undefined,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
        router.refresh();
      }
      setFormOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(room: Room) {
    const res = await fetch(`/api/rooms/${room.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !room.isActive }),
    });
    if (res.ok) {
      setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, isActive: !r.isActive } : r)));
    } else {
      toast.error((await res.json().catch(() => ({}))).error ?? "Impossible de modifier la salle");
    }
  }

  async function addAccess() {
    if (!accessRoom || !newAccessChurch) return;
    const res = await fetch(`/api/rooms/${accessRoom.id}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ churchId: newAccessChurch }),
    });
    if (res.ok) {
      const church = otherChurches.find((c) => c.id === newAccessChurch)!;
      const access = await res.json();
      setRooms((prev) =>
        prev.map((r) =>
          r.id === accessRoom.id ? { ...r, sharedWith: [...r.sharedWith, { id: access.id, church }] } : r
        )
      );
      setAccessRoom((prev) => (prev ? { ...prev, sharedWith: [...prev.sharedWith, { id: access.id, church }] } : prev));
      setNewAccessChurch("");
    } else {
      toast.error((await res.json().catch(() => ({}))).error ?? "Impossible d'ajouter l'église");
    }
  }

  async function removeAccess(roomId: string, targetChurchId: string) {
    const res = await fetch(`/api/rooms/${roomId}/access`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ churchId: targetChurchId }),
    });
    if (res.ok) {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomId ? { ...r, sharedWith: r.sharedWith.filter((a) => a.church.id !== targetChurchId) } : r
        )
      );
      setAccessRoom((prev) =>
        prev?.id === roomId ? { ...prev, sharedWith: prev.sharedWith.filter((a) => a.church.id !== targetChurchId) } : prev
      );
    } else {
      toast.error((await res.json().catch(() => ({}))).error ?? "Impossible de retirer l'église");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="w-full sm:w-56">
          <Select
            label="Filtrer par statut"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
            options={[
              { value: "all", label: "Toutes" },
              { value: "active", label: "Actives" },
              { value: "inactive", label: "Désactivées" },
            ]}
          />
        </div>
        <Button onClick={openCreate}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Créer une salle
        </Button>
      </div>

      <DataTable<Room>
        columns={[
          { header: "Nom", accessor: (r) => r.name },
          { header: "Capacité", accessor: (r) => r.capacity ?? "—" },
          { header: "Lieu", accessor: (r) => r.location ?? "—" },
          {
            header: "Partagée avec",
            accessor: (r) =>
              r.sharedWith.length > 0 ? r.sharedWith.map((a) => a.church.name).join(", ") : "—",
          },
          { header: "Réservations", accessor: (r) => r.reservationCount },
          {
            header: "Statut",
            accessor: (r) => (
              <StatusChip tone={r.isActive ? "success" : "neutral"}>
                {r.isActive ? "Active" : "Désactivée"}
              </StatusChip>
            ),
          },
        ]}
        data={displayedRooms}
        emptyMessage="Aucune salle"
        actions={(room) => (
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAccessRoom(room)}>
              Partager
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openEdit(room)}>
              Modifier
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toggleActive(room)}>
              {room.isActive ? "Désactiver" : "Activer"}
            </Button>
          </div>
        )}
      />

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Modifier la salle" : "Créer une salle"}>
        <div className="flex flex-col gap-4">
          <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Capacité (facultatif)"
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
          <Input label="Lieu (facultatif)" value={location} onChange={(e) => setLocation(e.target.value)} />
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button onClick={save} disabled={saving || !name} title={!name ? "Renseignez le nom de la salle" : undefined}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!accessRoom} onClose={() => setAccessRoom(null)} title={`Partager — ${accessRoom?.name ?? ""}`}>
        {accessRoom && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-muted">
              Églises autorisées à réserver cette salle, en plus de la vôtre.
            </p>
            <ul className="flex flex-col gap-2">
              {accessRoom.sharedWith.length === 0 && (
                <li className="text-sm text-ink-muted">Aucune église partenaire pour l&apos;instant.</li>
              )}
              {accessRoom.sharedWith.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-control border border-line py-1 pl-3 pr-1">
                  <span className="text-sm text-ink">{a.church.name}</span>
                  <IconButton
                    icon={X}
                    aria-label={`Retirer ${a.church.name}`}
                    onClick={() => removeAccess(accessRoom.id, a.church.id)}
                  />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1">
                <Select
                  label="Ajouter une église"
                  value={newAccessChurch}
                  onChange={(e) => setNewAccessChurch(e.target.value)}
                  options={otherChurches
                    .filter((c) => !accessRoom.sharedWith.some((a) => a.church.id === c.id))
                    .map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Choisir une église"
                />
              </div>
              <Button variant="secondary" onClick={addAccess} disabled={!newAccessChurch} title={!newAccessChurch ? "Choisissez une église" : undefined}>
                Ajouter l&apos;église
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
