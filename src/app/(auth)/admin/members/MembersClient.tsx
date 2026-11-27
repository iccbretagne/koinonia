"use client";

import { SubmitEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, BulkActionBar, Button, Checkbox, ConfirmModal, EmptyState, Input, Modal, SearchInput, Select, StatusChip, useToast } from "@/components/ui";
import { useConfirm } from "../use-confirm";

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
  /** Départements où le STAR est en période d'observation (candidatures, spec 077). */
  observationDeptIds?: string[];
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
  readonly initialMembers: Member[];
  readonly departments: { id: string; name: string; ministryName: string }[];
  readonly readOnly?: boolean;
  /**
   * Lier/délier un compte relève d'`access:manage`, distinct de `members:manage` (`readOnly`
   * ci-dessus) depuis la spec 054/#583 — un Resp. département gère ses fiches STAR mais ne lie
   * plus de compte, réservé à l'administration et au Ministre de son ministère.
   */
  readonly canLink?: boolean;
  /** L'appelant ne gère qu'une partie des départements : il lui faut retirer/rattacher un STAR. */
  readonly scoped?: boolean;
  readonly churchId: string;
}

const LS_FILTER_DEPT = "members_filter_dept";
const LS_FILTER_SEARCH = "members_filter_search";

export default function MembersClient({ initialMembers, departments, readOnly = false, canLink = false, scoped = false, churchId }: Props) {
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
  // Recherche initiale : le paramètre d'URL ?q= (palette ⌘K, /admin/members?q=Nom) prime sur la
  // dernière recherche mémorisée, pour qu'un lien partagé ou ouvert dans un nouvel onglet fonctionne.
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q");
  const [search, setSearch] = useState(() => {
    if (initialQuery) return initialQuery;
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
  /** Suppression à confirmer : une fiche ou la sélection. */
  const [pendingDelete, setPendingDelete] = useState<Member | "selection" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDialog, ask] = useConfirm();
  const toast = useToast();

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- réinitialisation de l'état local au changement de dépendance
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
        setRemoveModal((cur) => (cur?.id === m.id ? { ...cur, allDepartments: nextDepts } : cur));
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
        const existing = prev.some((x) => x.id === lookupSelected.id);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- réinitialisation de l'état local au changement de dépendance
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

  async function handleSubmit(e: SubmitEvent) {
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
    if (
      !(await ask({
        title: `Délier le compte de ${m.firstName} ${m.lastName} ?`,
        message: "Le compte n'est plus rattaché à cette fiche STAR ; la fiche est conservée.",
        confirmLabel: "Délier le compte",
      }))
    ) {
      return;
    }
    try {
      const res = await fetch("/api/member-user-links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: m.id, churchId: m.churchId }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erreur lors de la déliaison");
        return;
      }
      setMembers((prev) => prev.map((x) => x.id === m.id ? { ...x, userLink: null } : x));
      toast.success("Compte délié");
    } catch {
      toast.error("Erreur lors de la déliaison");
    }
  }

  async function handleDelete(m: Member) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/members/${m.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erreur lors de la suppression");
        return;
      }
      setMembers((prev) => prev.filter((x) => x.id !== m.id));
      setPendingDelete(null);
      toast.success("Fiche STAR supprimée");
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  }

  async function handleBulkDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "delete" }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erreur lors de la suppression");
        return;
      }
      setMembers((prev) => prev.filter((m) => !selectedIds.has(m.id)));
      toast.success(selectedIds.size > 1 ? "Fiches STAR supprimées" : "Fiche STAR supprimée");
      setSelectedIds(new Set());
      setPendingDelete(null);
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  }

  function openBulkEdit() {
    setBulkFirstName("");
    setBulkLastName("");
    setBulkDepartmentId("");
    setBulkError("");
    setBulkModalOpen(true);
  }

  async function handleBulkEdit(e: SubmitEvent) {
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
              if (!updated.allDepartments.some((d) => d.id === data.primaryDepartmentId)) {
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
        {!readOnly && <Button onClick={openCreate}>Créer un STAR</Button>}
        {!readOnly && scoped && (
          <Button variant="secondary" onClick={openAddExisting}>
            Ajouter un STAR existant
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <SearchInput
            aria-label="Rechercher un STAR"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un STAR…"
          />
        </div>
        <div className="w-full sm:w-64">
          <Select
            label=""
            aria-label="Filtrer par département"
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
          <Button type="button" variant="ghost" onClick={() => { setSearch(""); setFilterDept(""); }}>
            Réinitialiser les filtres
          </Button>
        )}
      </div>

      {/* Count + select all */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-ink-muted">
          {filtered.length} STAR{filtered.length > 1 ? "s" : ""}
          {(search || filterDept) && ` sur ${members.length}`}
        </p>
        {!readOnly && filtered.length > 0 && (
          <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={toggleSelectAll}>
            {selectedIds.size === filtered.length ? "Tout désélectionner" : "Tout sélectionner"}
          </Button>
        )}
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title={search || filterDept ? "Aucun STAR ne correspond" : "Aucun STAR"}
          description={search || filterDept ? "Modifiez la recherche ou le filtre." : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => {
            const isSelected = selectedIds.has(m.id);
            const secondaryDepts = m.allDepartments.filter((d) => !d.isPrimary);
            return (
              <div
                key={m.id}
                className={`flex flex-col gap-3 rounded-card border-2 bg-surface p-4 transition-colors ${
                  isSelected ? "border-brand bg-brand-soft" : "border-line hover:border-control-line"
                }`}
              >
                {/* Header: checkbox + name */}
                <div className="flex items-start gap-3">
                  {!readOnly && (
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleSelect(m.id)}
                      aria-label={`Sélectionner ${m.firstName} ${m.lastName}`}
                      className="mt-0.5"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink truncate">
                      {m.lastName} {m.firstName}
                    </p>
                    {m.userLink ? (
                      <p className="mt-0.5 truncate text-[13px] leading-[18px] text-ink-muted">
                        Compte lié : {m.userLink.userName ?? m.userLink.userEmail}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">Aucun compte lié</p>
                    )}
                  </div>
                </div>

                {/* Departments */}
                <div className="flex flex-wrap gap-1.5">
                  {(m.observationDeptIds ?? []).length > 0 && (
                    <StatusChip tone="warning">
                      En observation
                      {(() => {
                        const names = m.allDepartments.filter((d) => m.observationDeptIds!.includes(d.id)).map((d) => d.name);
                        return names.length > 0 ? ` · ${names.join(", ")}` : "";
                      })()}
                    </StatusChip>
                  )}
                  {m.primaryDepartment && (
                    <StatusChip tone="brand">
                      {m.primaryDepartment.name} · {m.primaryDepartment.ministry.name}
                    </StatusChip>
                  )}
                  {secondaryDepts.map((d) => (
                    <StatusChip key={d.id}>{d.name}</StatusChip>
                  ))}
                </div>

                {/* Actions */}
                {(!readOnly || canLink) && (
                  <div className="flex gap-2 flex-wrap pt-1 border-t border-line">
                    {canLink && (
                      m.userLink ? (
                        <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => handleUnlink(m)}>
                          Délier le compte
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm" className="min-h-11 sm:min-h-9"
                          onClick={() => { setLinkModal(m); setUserQuery(""); setSelectedUser(null); setUserResults([]); setLinkError(null); }}
                        >
                          Lier un compte
                        </Button>
                      )
                    )}
                    {!readOnly && (
                      <>
                        <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" onClick={() => openEdit(m)}>
                          Modifier
                        </Button>
                        {m.allDepartments.length > 1 &&
                          m.allDepartments.some((d) => manageableIds.has(d.id)) && (
                            <Button
                              variant="ghost"
                              size="sm" className="min-h-11 sm:min-h-9"
                              onClick={() => { setRemoveError(null); setRemoveModal(m); }}
                            >
                              Retirer d&apos;un département
                            </Button>
                          )}
                        <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setPendingDelete(m)}>
                          Supprimer
                        </Button>
                      </>
                    )}
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
        onDelete={() => setPendingDelete("selection")}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Modifier le STAR" : "Créer un STAR"}
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
            hint="Fortement recommandé : fiabilise le rattachement du compte."
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
          <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-semibold text-ink">Départements supplémentaires</legend>
            <div className="max-h-48 overflow-y-auto rounded-control border border-line p-1">
              {departments
                .filter((d) => d.id !== departmentId)
                .map((d) => (
                  <label key={d.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 hover:bg-surface-sunken">
                    <Checkbox
                      checked={additionalDeptIds.includes(d.id)}
                      onChange={() => toggleAdditionalDept(d.id)}
                    />
                    <span className="text-[15px] leading-[22px] text-ink">
                      {d.name} <span className="text-[13px] text-ink-muted">({d.ministryName})</span>
                    </span>
                  </label>
                ))}
            </div>
          </fieldset>
          {duplicateCandidates && duplicateCandidates.length > 0 && (
            <Alert tone="warning" title="Ces fiches existent déjà dans l'église — rattacher ou créer quand même ?">
              <ul className="mt-1 flex flex-col gap-1">
                {duplicateCandidates.map((d) => (
                  <li key={d.id} className="text-sm text-ink-muted flex items-center justify-between gap-2">
                    <span>
                      {d.lastName} {d.firstName}
                      {d.email && <span className="ml-1 text-[13px] text-ink-muted">{d.email}</span>}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm" className="min-h-11 sm:min-h-9"
                      onClick={() => {
                        setModalOpen(false);
                        setDuplicateCandidates(null);
                        setSearch(`${d.firstName} ${d.lastName}`);
                      }}
                    >
                      Voir la fiche
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="secondary"
                size="sm" className="min-h-11 sm:min-h-9"
                disabled={loading}
                onClick={() => submitMember(true)}
              >
                Créer quand même
              </Button>
            </Alert>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement…" : "Enregistrer"}
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
          <p className="text-sm text-ink-muted">
            Recherchez l&apos;utilisateur à lier à ce STAR.
          </p>
          <div>
            <Input
              label="Rechercher un utilisateur"
              value={userQuery}
              onChange={(e) => { setUserQuery(e.target.value); setSelectedUser(null); }}
              placeholder="Nom ou email…"
            />
            {userSearching && <p className="mt-1 text-[13px] text-ink-muted">Recherche…</p>}
            {userResults.length > 0 && !selectedUser && (
              <ul className="mt-1 overflow-hidden rounded-control border border-line">
                {userResults.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => { setSelectedUser(u); setUserQuery(u.displayName ?? u.name ?? u.email); setUserResults([]); }}
                      className="min-h-11 w-full px-3 py-2 text-left text-[15px] text-ink transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                    >
                      <span className="font-semibold">{u.displayName ?? u.name ?? u.email}</span>
                      {(u.displayName ?? u.name) && <span className="ml-1 text-[13px] text-ink-muted">{u.email}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {userQuery.length >= 2 && !userSearching && userResults.length === 0 && !selectedUser && (
              canLinkByEmail ? (
                <p className="mt-1 text-[13px] text-ink-muted">
                  Aucun compte n&apos;existe avec cette adresse. Un compte sera créé et rattaché à
                  ce STAR dès sa première connexion.
                </p>
              ) : (
                <p className="mt-1 text-[13px] text-ink-muted">Aucun utilisateur trouvé (comptes déjà liés exclus).</p>
              )
            )}
          </div>
          {linkError && <Alert tone="danger">{linkError}</Alert>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setLinkModal(null)}>Annuler</Button>
            <Button
              onClick={handleLink}
              disabled={(!selectedUser && !canLinkByEmail) || linkLoading}
              title={!selectedUser && !canLinkByEmail ? "Choisissez d'abord un compte dans la liste" : undefined}
            >
              {linkLoading ? "Liaison…" : "Lier le compte"}
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
          <p className="text-sm text-ink-muted">
            La fiche du STAR est conservée. Ses affectations de planning et ses tâches à venir dans
            le département retiré sont supprimées.
          </p>
          <ul className="space-y-2">
            {(removeModal?.allDepartments ?? [])
              .filter((d) => manageableIds.has(d.id))
              .map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2">
                  <span className="inline-flex flex-wrap items-center gap-2 text-[15px] text-ink">
                    {d.name}
                    {d.isPrimary && <StatusChip tone="brand">Principal</StatusChip>}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm" className="min-h-11 sm:min-h-9"
                    disabled={removeLoading !== null}
                    onClick={() => removeModal && handleRemoveDept(removeModal, d.id)}
                  >
                    {removeLoading === d.id ? "Retrait…" : "Retirer"}
                  </Button>
                </li>
              ))}
          </ul>
          {removeError && <Alert tone="danger">{removeError}</Alert>}
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setRemoveModal(null)}>Fermer</Button>
          </div>
        </div>
      </Modal>

      {/* Ajouter un STAR existant */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Ajouter un STAR existant">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Recherchez un STAR déjà enregistré dans l&apos;église, même hors de votre périmètre,
            pour le rattacher à l&apos;un de vos départements.
          </p>
          <div>
            <Input
              label="Rechercher un STAR"
              value={lookupQuery}
              onChange={(e) => { setLookupQuery(e.target.value); setLookupSelected(null); }}
              placeholder="Nom ou prénom…"
            />
            {lookupSearching && <p className="mt-1 text-[13px] text-ink-muted">Recherche…</p>}
            {lookupResults.length > 0 && !lookupSelected && (
              <ul className="mt-1 max-h-48 overflow-hidden overflow-y-auto rounded-control border border-line">
                {lookupResults.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => { setLookupSelected(r); setLookupResults([]); }}
                      className="min-h-11 w-full px-3 py-2 text-left text-[15px] text-ink transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                    >
                      <span className="font-semibold">{r.lastName} {r.firstName}</span>
                      {r.departmentNames.length > 0 && (
                        <span className="ml-1 text-[13px] text-ink-muted">{r.departmentNames.join(", ")}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {lookupQuery.trim().length >= 2 && !lookupSearching && lookupResults.length === 0 && !lookupSelected && (
              <p className="mt-1 text-[13px] text-ink-muted">Aucun STAR trouvé.</p>
            )}
            {lookupSelected && (
              <p className="text-sm text-ink-muted mt-2">
                Sélectionné : <span className="font-semibold text-ink">{lookupSelected.lastName} {lookupSelected.firstName}</span>
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
            <Alert tone="warning">Ce STAR appartient déjà à ce département.</Alert>
          )}
          {addError && <Alert tone="danger">{addError}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Annuler</Button>
            <Button
              onClick={handleAddExisting}
              disabled={!lookupSelected || !addDeptId || addLoading || lookupSelected.departmentIds.includes(addDeptId)}
            >
              {addLoading ? "Rattachement…" : "Rattacher le STAR"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk edit modal */}
      <Modal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title={selectedIds.size > 1 ? `Modifier ${selectedIds.size} STAR` : "Modifier 1 STAR"}
      >
        <p className="text-sm text-ink-muted mb-4">
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
          {bulkError && <Alert tone="danger">{bulkError}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setBulkModalOpen(false)}>
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
              ? `Supprimer ${selectedIds.size} fiches STAR ?`
              : "Supprimer 1 fiche STAR ?"
            : `Supprimer la fiche de ${pendingDelete?.firstName ?? ""} ${pendingDelete?.lastName ?? ""} ?`
        }
        message="La fiche et ses affectations sont supprimées définitivement."
        confirmLabel={pendingDelete === "selection" && selectedIds.size > 1 ? "Supprimer les fiches" : "Supprimer la fiche"}
        confirmingLabel="Suppression…"
        confirming={deleting}
        onConfirm={() => {
          if (pendingDelete === "selection") void handleBulkDelete();
          else if (pendingDelete) void handleDelete(pendingDelete);
        }}
        onCancel={() => setPendingDelete(null)}
      />
      {confirmDialog}
    </>
  );
}
