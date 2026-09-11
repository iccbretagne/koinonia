"use client";

import { useState, useEffect, useRef } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import BulkActionBar from "@/components/ui/BulkActionBar";

type UserResult = { id: string; name: string | null; email: string; displayName: string | null; image: string | null };

interface DeptRef {
  id: string;
  name: string;
  isPrimary: boolean;
  ministry: { id: string; name: string };
}

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  churchId: string;
  primaryDepartment: { id: string; name: string; ministry: { id: string; name: string } } | null;
  allDepartments: DeptRef[];
  userLink: { userId: string; userName: string | null; userEmail: string } | null;
}

type DuplicateCandidate = { id: string; firstName: string; lastName: string; email: string | null };

type LookupResult = {
  id: string;
  firstName: string;
  lastName: string;
  departmentIds: string[];
  departmentNames: string[];
};

interface Props {
  initialMembers: Member[];
  departments: { id: string; name: string; ministryName: string }[];
  readOnly?: boolean;
  /** L'appelant ne gère qu'une partie des départements : il lui faut retirer/rattacher un STAR. */
  scoped?: boolean;
  churchId: string;
}

const LS_FILTER_DEPT = "members_filter_dept";
const LS_FILTER_SEARCH = "members_filter_search";

export default function MembersClient({ initialMembers, departments, readOnly = false, scoped = false, churchId }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || "");
  const [additionalDeptIds, setAdditionalDeptIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateCandidate[] | null>(null);
  const [filterDept, setFilterDept] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem(LS_FILTER_DEPT) ?? "";
    return "";
  });
  const [search, setSearch] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem(LS_FILTER_SEARCH) ?? "";
    return "";
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkFirstName, setBulkFirstName] = useState("");
  const [bulkLastName, setBulkLastName] = useState("");
  const [bulkDepartmentId, setBulkDepartmentId] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Link user modal
  const [linkModal, setLinkModal] = useState<Member | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [userSearching, setUserSearching] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const userSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Retrait d'un département / rattachement d'un STAR existant
  const [removeModal, setRemoveModal] = useState<Member | null>(null);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([]);
  const [lookupSearching, setLookupSearching] = useState(false);
  const [lookupSelected, setLookupSelected] = useState<LookupResult | null>(null);
  const [addDeptId, setAddDeptId] = useState(departments[0]?.id ?? "");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const manageableIds = new Set(departments.map((d) => d.id));

  useEffect(() => {
    if (!addOpen || lookupQuery.trim().length < 2) { setLookupResults([]); return; }
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(async () => {
      setLookupSearching(true);
      try {
        const res = await fetch(
          `/api/members/lookup?churchId=${encodeURIComponent(churchId)}&q=${encodeURIComponent(lookupQuery.trim())}`
        );
        const json = await res.json();
        setLookupResults(Array.isArray(json) ? json : (json?.data ?? []));
      } finally {
        setLookupSearching(false);
      }
    }, 300);
  }, [addOpen, lookupQuery, churchId]);

  async function handleRemoveDept(m: Member, deptId: string) {
    setRemoveError(null);
    setRemoveLoading(deptId);
    try {
      const res = await fetch(
        `/api/members/${m.id}/departments?departmentId=${encodeURIComponent(deptId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Erreur lors du retrait");
      }
      const remaining = m.allDepartments.filter((d) => d.id !== deptId);
      const lostPrimary = m.allDepartments.find((d) => d.id === deptId)?.isPrimary ?? false;
      const nextDepts = remaining.map((d, i) => ({ ...d, isPrimary: lostPrimary ? i === 0 : d.isPrimary }));
      const nextPrimary = nextDepts.find((d) => d.isPrimary) ?? null;
      // Hors périmètre après retrait : le STAR disparaît de la liste, qui n'affiche que le périmètre
      const stillVisible = nextDepts.some((d) => manageableIds.has(d.id));
      setMembers((prev) =>
        stillVisible
          ? prev.map((x) =>
              x.id === m.id
                ? {
                    ...x,
                    allDepartments: nextDepts,
                    primaryDepartment: nextPrimary
                      ? { id: nextPrimary.id, name: nextPrimary.name, ministry: nextPrimary.ministry }
                      : null,
                  }
                : x
            )
          : prev.filter((x) => x.id !== m.id)
      );
      if (!stillVisible || nextDepts.filter((d) => manageableIds.has(d.id)).length === 0) {
        setRemoveModal(null);
      } else {
        setRemoveModal((cur) => (cur && cur.id === m.id ? { ...cur, allDepartments: nextDepts } : cur));
      }
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRemoveLoading(null);
    }
  }

  function openAddExisting() {
    setLookupQuery("");
    setLookupResults([]);
    setLookupSelected(null);
    setAddDeptId(departments[0]?.id ?? "");
    setAddError(null);
    setAddOpen(true);
  }

  async function handleAddExisting() {
    if (!lookupSelected || !addDeptId) return;
    setAddError(null);
    setAddLoading(true);
    try {
      const res = await fetch(`/api/members/${lookupSelected.id}/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: addDeptId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Erreur lors du rattachement");
      }
      const dept = departments.find((d) => d.id === addDeptId)!;
      const newRef: DeptRef = {
        id: dept.id,
        name: dept.name,
        isPrimary: false,
        ministry: { id: "", name: dept.ministryName },
      };
      setMembers((prev) => {
        const existing = prev.find((x) => x.id === lookupSelected.id);
        if (existing) {
          return prev.map((x) =>
            x.id === lookupSelected.id ? { ...x, allDepartments: [...x.allDepartments, newRef] } : x
          );
        }
        return [
          ...prev,
          {
            id: lookupSelected.id,
            firstName: lookupSelected.firstName,
            lastName: lookupSelected.lastName,
            email: null,
            churchId,
            primaryDepartment: null,
            allDepartments: [newRef],
            userLink: null,
          },
        ];
      });
      setAddOpen(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAddLoading(false);
    }
  }

  // Persist filters
  useEffect(() => { localStorage.setItem(LS_FILTER_DEPT, filterDept); }, [filterDept]);
  useEffect(() => { localStorage.setItem(LS_FILTER_SEARCH, search); }, [search]);

  useEffect(() => {
    if (!linkModal || userQuery.length < 2) { setUserResults([]); return; }
    if (userSearchTimer.current) clearTimeout(userSearchTimer.current);
    userSearchTimer.current = setTimeout(async () => {
      setUserSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(userQuery)}&churchId=${linkModal.churchId}`);
        const json = await res.json();
        setUserResults(Array.isArray(json) ? json : []);
      } finally {
        setUserSearching(false);
      }
    }, 300);
  }, [userQuery, linkModal]);

  // Une adresse email exacte, sans compte trouvé par la recherche : la recherche interroge déjà
  // toute la plateforme par correspondance exacte (spec 037), donc un résultat vide à ce stade
  // signifie réellement qu'aucun compte n'existe avec cette adresse — pas seulement qu'aucun
  // compte de cette église ne la porte.
  const canLinkByEmail =
    !selectedUser && !userSearching && userResults.length === 0 && userQuery.trim().includes("@");

  async function handleLink() {
    if (!linkModal) return;
    if (!selectedUser && !canLinkByEmail) return;
    setLinkError(null);
    setLinkLoading(true);
    try {
      const body = selectedUser
        ? { memberId: linkModal.id, userId: selectedUser.id, churchId: linkModal.churchId }
        : { memberId: linkModal.id, email: userQuery.trim(), churchId: linkModal.churchId, confirmCreate: true };
      const res = await fetch("/api/member-user-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setMembers((prev) => prev.map((m) =>
        m.id === linkModal.id
          ? {
              ...m,
              userLink: {
                userId: json.userId,
                userName: selectedUser?.displayName ?? selectedUser?.name ?? null,
                userEmail: selectedUser?.email ?? userQuery.trim(),
              },
            }
          : m
      ));
      setLinkModal(null);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLinkLoading(false);
    }
  }

  function toggleAdditionalDept(deptId: string) {
    setAdditionalDeptIds((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId]
    );
  }

  function openCreate() {
    setEditing(null);
    setFirstName("");
    setLastName("");
    setEmail("");
    setDepartmentId(departments[0]?.id || "");
    setAdditionalDeptIds([]);
    setError("");
    setDuplicateCandidates(null);
    setModalOpen(true);
  }

  function openEdit(m: Member) {
    setEditing(m);
    setFirstName(m.firstName);
    setLastName(m.lastName);
    setEmail(m.email ?? "");
    // `departments` = départements gérables par l'utilisateur (scopé côté serveur).
    // Si le principal réel du STAR est hors périmètre, on retombe sur un département géré
    // pour le sélecteur ; le serveur préserve de toute façon le vrai principal hors scope.
    const manageableIds = new Set(departments.map((d) => d.id));
    const actualPrimary = m.primaryDepartment?.id ?? m.allDepartments[0]?.id;
    const primaryId =
      actualPrimary && manageableIds.has(actualPrimary)
        ? actualPrimary
        : m.allDepartments.find((d) => manageableIds.has(d.id))?.id ?? departments[0]?.id ?? "";
    setDepartmentId(primaryId);
    // Ne pré-cocher que les départements gérés ; les affiliations hors périmètre restent intactes
    setAdditionalDeptIds(
      m.allDepartments.filter((d) => d.id !== primaryId && manageableIds.has(d.id)).map((d) => d.id)
    );
    setError("");
    setDuplicateCandidates(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitMember(false);
  }

  async function submitMember(confirmDuplicate: boolean) {
    setLoading(true);
    setError("");

    try {
      const url = editing ? `/api/members/${editing.id}` : "/api/members";
      const method = editing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email: email || undefined,
          departmentId,
          additionalDepartmentIds: additionalDeptIds.filter((id) => id !== departmentId),
          ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
        }),
      });

      if (res.status === 409) {
        const data = await res.json();
        setDuplicateCandidates(data.duplicates ?? []);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }

      const saved = await res.json();
      const normalizedMember = normalizeMember(saved);

      if (editing) {
        setMembers((prev) => prev.map((m) => (m.id === normalizedMember.id ? normalizedMember : m)));
      } else {
        setMembers((prev) => [...prev, normalizedMember]);
      }

      setDuplicateCandidates(null);
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  function normalizeMember(raw: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    departments?: { isPrimary: boolean; department: { id: string; name: string; ministry: { id: string; name: string; churchId?: string } } }[];
    userLink?: { userId: string; userName?: string | null; userEmail?: string; user?: { name: string | null; email: string } } | null;
    churchId?: string;
  }): Member {
    const depts = raw.departments ?? [];
    const primaryDept = depts.find((d) => d.isPrimary) ?? depts[0];
    return {
      id: raw.id,
      firstName: raw.firstName,
      lastName: raw.lastName,
      email: raw.email ?? null,
      churchId: raw.churchId ?? primaryDept?.department.ministry.churchId ?? "",
      primaryDepartment: primaryDept
        ? { id: primaryDept.department.id, name: primaryDept.department.name, ministry: primaryDept.department.ministry }
        : null,
      allDepartments: depts.map((d) => ({
        id: d.department.id,
        name: d.department.name,
        isPrimary: d.isPrimary,
        ministry: d.department.ministry,
      })),
      userLink: raw.userLink
        ? {
            userId: raw.userLink.userId,
            userName: raw.userLink.userName ?? raw.userLink.user?.name ?? null,
            userEmail: raw.userLink.userEmail ?? raw.userLink.user?.email ?? "",
          }
        : null,
    };
  }

  async function handleUnlink(m: Member) {
    if (!confirm(`Délier le compte de ${m.firstName} ${m.lastName} ?`)) return;
    try {
      const res = await fetch("/api/member-user-links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: m.id, churchId: m.churchId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la déliaison");
        return;
      }
      setMembers((prev) => prev.map((x) => x.id === m.id ? { ...x, userLink: null } : x));
    } catch {
      alert("Erreur lors de la déliaison");
    }
  }

  async function handleDelete(m: Member) {
    if (!confirm(`Supprimer ${m.firstName} ${m.lastName} ?`)) return;
    try {
      const res = await fetch(`/api/members/${m.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      setMembers((prev) => prev.filter((x) => x.id !== m.id));
    } catch {
      alert("Erreur lors de la suppression");
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Supprimer ${selectedIds.size} STAR ?`)) return;
    try {
      const res = await fetch("/api/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "delete" }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      setMembers((prev) => prev.filter((m) => !selectedIds.has(m.id)));
      setSelectedIds(new Set());
    } catch {
      alert("Erreur lors de la suppression");
    }
  }

  function openBulkEdit() {
    setBulkFirstName("");
    setBulkLastName("");
    setBulkDepartmentId("");
    setBulkError("");
    setBulkModalOpen(true);
  }

  async function handleBulkEdit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, string> = {};
    if (bulkFirstName) data.firstName = bulkFirstName;
    if (bulkLastName) data.lastName = bulkLastName;
    if (bulkDepartmentId) data.primaryDepartmentId = bulkDepartmentId;

    if (Object.keys(data).length === 0) {
      setBulkError("Remplissez au moins un champ");
      return;
    }

    setBulkLoading(true);
    setBulkError("");

    try {
      const res = await fetch("/api/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "update", data }),
      });

      if (!res.ok) {
        const resp = await res.json();
        throw new Error(resp.error || "Erreur");
      }

      setMembers((prev) =>
        prev.map((m) => {
          if (!selectedIds.has(m.id)) return m;
          const updated = { ...m };
          if (data.firstName) updated.firstName = data.firstName;
          if (data.lastName) updated.lastName = data.lastName;
          if (data.primaryDepartmentId) {
            const dept = departments.find((d) => d.id === data.primaryDepartmentId);
            if (dept) {
              updated.primaryDepartment = { id: dept.id, name: dept.name, ministry: m.primaryDepartment?.ministry ?? { id: "", name: dept.ministryName } };
              updated.allDepartments = updated.allDepartments.map((d) => ({
                ...d,
                isPrimary: d.id === data.primaryDepartmentId,
              }));
              if (!updated.allDepartments.find((d) => d.id === data.primaryDepartmentId)) {
                updated.allDepartments = [
                  { id: dept.id, name: dept.name, isPrimary: true, ministry: { id: "", name: dept.ministryName } },
                  ...updated.allDepartments,
                ];
              }
            }
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

  const filtered = members
    .filter((m) => {
      if (filterDept && !m.allDepartments.some((d) => d.id === filterDept)) return false;
      if (search) {
        const q = search.toLowerCase();
        const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
        if (!fullName.includes(q) && !`${m.lastName} ${m.firstName}`.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "fr"));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((m) => m.id)));
    }
  }

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {!readOnly && <Button onClick={openCreate}>Nouveau STAR</Button>}
        {!readOnly && scoped && (
          <Button variant="secondary" onClick={openAddExisting}>
            Ajouter un STAR existant
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un STAR..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
          />
        </div>
        <div className="w-full sm:w-64">
          <Select
            label=""
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            placeholder="Tous les départements"
            options={departments.map((d) => ({
              value: d.id,
              label: `${d.name} (${d.ministryName})`,
            }))}
          />
        </div>
        {(search || filterDept) && (
          <button
            onClick={() => { setSearch(""); setFilterDept(""); }}
            className="text-sm text-gray-400 hover:text-gray-600 whitespace-nowrap"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Count + select all */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">
          {filtered.length} STAR{filtered.length > 1 ? "s" : ""}
          {(search || filterDept) && ` sur ${members.length}`}
        </p>
        {!readOnly && filtered.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="text-sm text-icc-violet hover:underline"
          >
            {selectedIds.size === filtered.length ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
        )}
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
          Aucun STAR.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => {
            const isSelected = selectedIds.has(m.id);
            const secondaryDepts = m.allDepartments.filter((d) => !d.isPrimary);
            return (
              <div
                key={m.id}
                className={`bg-white rounded-xl border-2 p-4 flex flex-col gap-3 transition-colors ${
                  isSelected ? "border-icc-violet bg-icc-violet/5" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {/* Header: checkbox + name */}
                <div className="flex items-start gap-3">
                  {!readOnly && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(m.id)}
                      className="mt-0.5 rounded border-gray-300 text-icc-violet focus:ring-icc-violet shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {m.lastName} {m.firstName}
                    </p>
                    {m.userLink ? (
                      <p className="text-xs text-green-700 truncate mt-0.5">
                        {m.userLink.userName ?? m.userLink.userEmail}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-0.5">Non lié</p>
                    )}
                  </div>
                </div>

                {/* Departments */}
                <div className="flex flex-wrap gap-1.5">
                  {m.primaryDepartment && (
                    <span className="text-xs bg-icc-violet/10 text-icc-violet px-2 py-0.5 rounded-full font-medium">
                      {m.primaryDepartment.name}
                      <span className="text-icc-violet/60 ml-1">{m.primaryDepartment.ministry.name}</span>
                    </span>
                  )}
                  {secondaryDepts.map((d) => (
                    <span key={d.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {d.name}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                {!readOnly && (
                  <div className="flex gap-2 flex-wrap pt-1 border-t border-gray-100">
                    {m.userLink ? (
                      <Button variant="secondary" size="sm" onClick={() => handleUnlink(m)}>
                        Délier
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { setLinkModal(m); setUserQuery(""); setSelectedUser(null); setUserResults([]); setLinkError(null); }}
                      >
                        Lier
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => openEdit(m)}>
                      Modifier
                    </Button>
                    {m.allDepartments.length > 1 &&
                      m.allDepartments.some((d) => manageableIds.has(d.id)) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => { setRemoveError(null); setRemoveModal(m); }}
                        >
                          Retirer
                        </Button>
                      )}
                    <Button variant="danger" size="sm" onClick={() => handleDelete(m)}>
                      Supprimer
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <BulkActionBar
        count={selectedIds.size}
        onEdit={openBulkEdit}
        onDelete={handleBulkDelete}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Modifier le STAR" : "Nouveau STAR"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Prénom"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <Input
            label="Nom"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Fortement recommandé — fiabilise le rattachement du compte"
          />
          <Select
            label="Département principal"
            value={departmentId}
            onChange={(e) => {
              const newPrimary = e.target.value;
              setDepartmentId(newPrimary);
              setAdditionalDeptIds((prev) => prev.filter((id) => id !== newPrimary));
            }}
            options={departments.map((d) => ({
              value: d.id,
              label: `${d.name} (${d.ministryName})`,
            }))}
          />
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Départements supplémentaires</p>
            <div className="space-y-1 max-h-40 overflow-y-auto border-2 border-gray-200 rounded-lg p-2">
              {departments
                .filter((d) => d.id !== departmentId)
                .map((d) => (
                  <label key={d.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={additionalDeptIds.includes(d.id)}
                      onChange={() => toggleAdditionalDept(d.id)}
                      className="rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
                    />
                    <span className="text-sm text-gray-700">
                      {d.name} <span className="text-gray-400 text-xs">({d.ministryName})</span>
                    </span>
                  </label>
                ))}
            </div>
          </div>
          {duplicateCandidates && duplicateCandidates.length > 0 && (
            <div className="rounded-lg border-2 border-icc-jaune bg-icc-jaune/10 p-3 space-y-2">
              <p className="text-sm font-medium text-gray-800">
                Ces fiches existent déjà dans l&apos;église — rattacher ou créer quand même ?
              </p>
              <ul className="space-y-1">
                {duplicateCandidates.map((d) => (
                  <li key={d.id} className="text-sm text-gray-700 flex items-center justify-between gap-2">
                    <span>
                      {d.lastName} {d.firstName}
                      {d.email && <span className="text-gray-400 ml-1 text-xs">{d.email}</span>}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-icc-violet hover:underline whitespace-nowrap"
                      onClick={() => {
                        setModalOpen(false);
                        setDuplicateCandidates(null);
                        setSearch(`${d.firstName} ${d.lastName}`);
                      }}
                    >
                      Voir la fiche
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={loading}
                onClick={() => submitMember(true)}
              >
                Créer quand même
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Link user modal */}
      <Modal
        open={!!linkModal}
        onClose={() => setLinkModal(null)}
        title={`Lier un compte à ${linkModal?.firstName} ${linkModal?.lastName}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Recherchez l&apos;utilisateur à lier à ce STAR.
          </p>
          <div>
            <Input
              label="Rechercher un utilisateur"
              value={userQuery}
              onChange={(e) => { setUserQuery(e.target.value); setSelectedUser(null); }}
              placeholder="Nom ou email..."
            />
            {userSearching && <p className="text-xs text-gray-400 mt-1">Recherche...</p>}
            {userResults.length > 0 && !selectedUser && (
              <ul className="mt-1 border-2 border-gray-200 rounded-lg overflow-hidden">
                {userResults.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => { setSelectedUser(u); setUserQuery(u.displayName ?? u.name ?? u.email); setUserResults([]); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-icc-violet/5 transition-colors"
                    >
                      <span className="font-medium">{u.displayName ?? u.name ?? u.email}</span>
                      {(u.displayName ?? u.name) && <span className="text-gray-400 ml-1 text-xs">{u.email}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {userQuery.length >= 2 && !userSearching && userResults.length === 0 && !selectedUser && (
              canLinkByEmail ? (
                <p className="text-xs text-gray-500 mt-1">
                  Aucun compte n&apos;existe avec cette adresse. Un compte sera créé et rattaché à
                  ce STAR dès sa première connexion.
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">Aucun utilisateur trouvé (déjà liés exclus)</p>
              )
            )}
          </div>
          {linkError && <p className="text-sm text-icc-rouge">{linkError}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setLinkModal(null)}>Annuler</Button>
            <Button onClick={handleLink} disabled={(!selectedUser && !canLinkByEmail) || linkLoading}>
              {linkLoading ? "En cours..." : "Lier"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Retirer d'un département */}
      <Modal
        open={!!removeModal}
        onClose={() => setRemoveModal(null)}
        title={`Retirer ${removeModal?.firstName} ${removeModal?.lastName} d'un département`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            La fiche du STAR est conservée. Ses affectations de planning et ses tâches à venir dans
            le département retiré sont supprimées.
          </p>
          <ul className="space-y-2">
            {(removeModal?.allDepartments ?? [])
              .filter((d) => manageableIds.has(d.id))
              .map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 border-2 border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-700">
                    {d.name}
                    {d.isPrimary && <span className="text-xs text-icc-violet ml-1">principal</span>}
                  </span>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={removeLoading !== null}
                    onClick={() => removeModal && handleRemoveDept(removeModal, d.id)}
                  >
                    {removeLoading === d.id ? "Retrait…" : "Retirer"}
                  </Button>
                </li>
              ))}
          </ul>
          {removeError && <p className="text-sm text-icc-rouge">{removeError}</p>}
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setRemoveModal(null)}>Fermer</Button>
          </div>
        </div>
      </Modal>

      {/* Ajouter un STAR existant */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Ajouter un STAR existant">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Recherchez un STAR déjà enregistré dans l&apos;église, même hors de votre périmètre,
            pour le rattacher à l&apos;un de vos départements.
          </p>
          <div>
            <Input
              label="Rechercher un STAR"
              value={lookupQuery}
              onChange={(e) => { setLookupQuery(e.target.value); setLookupSelected(null); }}
              placeholder="Nom ou prénom..."
            />
            {lookupSearching && <p className="text-xs text-gray-400 mt-1">Recherche...</p>}
            {lookupResults.length > 0 && !lookupSelected && (
              <ul className="mt-1 border-2 border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {lookupResults.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => { setLookupSelected(r); setLookupResults([]); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-icc-violet/5 transition-colors"
                    >
                      <span className="font-medium">{r.lastName} {r.firstName}</span>
                      {r.departmentNames.length > 0 && (
                        <span className="text-gray-400 ml-1 text-xs">{r.departmentNames.join(", ")}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {lookupQuery.trim().length >= 2 && !lookupSearching && lookupResults.length === 0 && !lookupSelected && (
              <p className="text-xs text-gray-400 mt-1">Aucun STAR trouvé.</p>
            )}
            {lookupSelected && (
              <p className="text-sm text-gray-700 mt-2">
                Sélectionné : <span className="font-medium">{lookupSelected.lastName} {lookupSelected.firstName}</span>
              </p>
            )}
          </div>
          <Select
            label="Rattacher au département"
            value={addDeptId}
            onChange={(e) => setAddDeptId(e.target.value)}
            options={departments.map((d) => ({ value: d.id, label: `${d.name} (${d.ministryName})` }))}
          />
          {lookupSelected?.departmentIds.includes(addDeptId) && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Ce STAR appartient déjà à ce département.
            </p>
          )}
          {addError && <p className="text-sm text-icc-rouge">{addError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Annuler</Button>
            <Button
              onClick={handleAddExisting}
              disabled={!lookupSelected || !addDeptId || addLoading || lookupSelected.departmentIds.includes(addDeptId)}
            >
              {addLoading ? "Rattachement…" : "Rattacher"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk edit modal */}
      <Modal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title={`Modifier ${selectedIds.size} STAR`}
      >
        <p className="text-sm text-gray-500 mb-4">
          Seuls les champs remplis seront modifiés.
        </p>
        <form onSubmit={handleBulkEdit} className="space-y-4">
          <Input
            label="Prénom"
            value={bulkFirstName}
            onChange={(e) => setBulkFirstName(e.target.value)}
            placeholder="Laisser vide pour ne pas modifier"
          />
          <Input
            label="Nom"
            value={bulkLastName}
            onChange={(e) => setBulkLastName(e.target.value)}
            placeholder="Laisser vide pour ne pas modifier"
          />
          <Select
            label="Département principal"
            value={bulkDepartmentId}
            onChange={(e) => setBulkDepartmentId(e.target.value)}
            placeholder="Ne pas modifier"
            options={departments.map((d) => ({
              value: d.id,
              label: `${d.name} (${d.ministryName})`,
            }))}
          />
          {bulkError && <p className="text-sm text-red-600">{bulkError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setBulkModalOpen(false)}>
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
