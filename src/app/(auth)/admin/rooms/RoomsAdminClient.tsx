"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import DataTable from "@/components/ui/DataTable";

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
  churchId: string;
  initialRooms: Room[];
  otherChurches: Church[];
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
        prev && prev.id === roomId ? { ...prev, sharedWith: prev.sharedWith.filter((a) => a.church.id !== targetChurchId) } : prev
      );
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
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
        <Button onClick={openCreate}>Nouvelle salle</Button>
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
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  r.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {r.isActive ? "Active" : "Désactivée"}
              </span>
            ),
          },
        ]}
        data={displayedRooms}
        emptyMessage="Aucune salle."
        actions={(room) => (
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="secondary" onClick={() => setAccessRoom(room)}>
              Partage
            </Button>
            <Button size="sm" variant="edit" onClick={() => openEdit(room)}>
              Modifier
            </Button>
            <Button size="sm" variant={room.isActive ? "danger" : "secondary"} onClick={() => toggleActive(room)}>
              {room.isActive ? "Désactiver" : "Activer"}
            </Button>
          </div>
        )}
      />

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Modifier la salle" : "Nouvelle salle"}>
        <div className="space-y-4">
          <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Capacité (optionnel)"
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
          <Input label="Lieu (optionnel)" value={location} onChange={(e) => setLocation(e.target.value)} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setFormOpen(false)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
              Annuler
            </button>
            <Button onClick={save} disabled={saving || !name}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!accessRoom} onClose={() => setAccessRoom(null)} title={`Partage — ${accessRoom?.name ?? ""}`}>
        {accessRoom && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Églises autorisées à réserver cette salle, en plus de la vôtre.
            </p>
            <ul className="space-y-2">
              {accessRoom.sharedWith.length === 0 && (
                <li className="text-sm text-gray-400">Aucune église partenaire pour l&apos;instant.</li>
              )}
              {accessRoom.sharedWith.map((a) => (
                <li key={a.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-sm">{a.church.name}</span>
                  <button
                    onClick={() => removeAccess(accessRoom.id, a.church.id)}
                    className="text-xs text-icc-rouge hover:underline"
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Select
                  label="Ajouter une église"
                  value={newAccessChurch}
                  onChange={(e) => setNewAccessChurch(e.target.value)}
                  options={otherChurches
                    .filter((c) => !accessRoom.sharedWith.some((a) => a.church.id === c.id))
                    .map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Choisir…"
                />
              </div>
              <Button size="sm" onClick={addAccess} disabled={!newAccessChurch}>
                Ajouter
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
