"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, Eye, FileText, Headphones, MessageSquare, Repeat, TriangleAlert, UserX, type LucideIcon } from "lucide-react";
import ExportBar from "@/components/ExportBar";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import { PageSkeleton } from "@/components/ui/Skeleton";
import StatusChip from "@/components/ui/StatusChip";
import { buttonClasses } from "@/components/ui/button-classes";
import { useToast } from "@/components/ui/Toast";
import { type OpeningClosingData } from "./OpeningClosingManager";
import { type AnnouncementSheetData } from "./AnnouncementSheetManager";
import PreparationBanner from "./PreparationBanner";
import { useSnapshotExport } from "@/components/useSnapshotExport";

interface MemberItem {
  id: string;
  firstName: string;
  lastName: string;
  status: "EN_SERVICE" | "EN_SERVICE_DEBRIEF" | "REMPLACANT";
}

interface DepartmentItem {
  id: string;
  name: string;
  ministryName: string;
  members: MemberItem[];
}

interface StarViewData {
  event: {
    id: string;
    title: string;
    date: string;
    church: { name: string };
    welcomeDutyEnabled: boolean;
  };
  departments: DepartmentItem[];
  totalStars: number;
  /** Départements sans STAR planifié à signaler à l'appelant (vide pour un STAR, un événement passé). */
  unstaffedDepartmentIds: string[];
  /** `planning:edit` : « Planifier » ; sinon la grille s'ouvre en lecture seule (« Voir »). */
  canEditPlanning: boolean;
  welcomeFamilies: string[];
  audioLink: { url: string } | null;
  openingClosing: OpeningClosingData;
  announcementSheet: AnnouncementSheetData;
}

interface Props {
  readonly eventId: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function StarViewClient({ eventId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<StarViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingSheet, setDownloadingSheet] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/star-view`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données au montage et au changement de dépendance
    void fetchData();
  }, [fetchData]);

  function getExportFileName() {
    return `STAR-${data?.event.title || "export"}`;
  }

  const { exporting, copyImage, downloadImage, exportPdf } = useSnapshotExport(printRef, {
    captureWidth: "1122px",
    orientation: "landscape",
    fileName: getExportFileName,
    copyWindowTitle: "STAR - copier l'image",
  });

  async function downloadAnnouncementSheet() {
    if (downloadingSheet) return;
    setDownloadingSheet(true);
    try {
      const res = await fetch(`/api/events/${eventId}/announcement-sheet`);
      const body = await res.json();
      if (!res.ok || !body.downloadUrl) {
        toast.error(body.error || "Trame introuvable.");
        return;
      }
      window.location.href = body.downloadUrl;
    } catch {
      toast.error("Téléchargement impossible. Réessayez dans un instant.");
    } finally {
      setDownloadingSheet(false);
    }
  }

  if (loading) {
    return <PageSkeleton rows={4} label="Chargement de l'équipe…" />;
  }

  if (!data) {
    return (
      <Alert
        tone="danger"
        title="Cet événement n'a pas pu être chargé."
        action={
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            Revenir en arrière
          </Button>
        }
      >
        Il a peut-être été supprimé, ou vous n&apos;y avez pas accès.
      </Alert>
    );
  }

  const activeDepartments = data.departments.filter((d) => d.members.length > 0);
  // Bandeau et boutons réservés à l'écran de qui peut planifier : l'export partagé (image, PDF) et
  // l'impression montrent des cartes neutres « Pas de STAR planifié ».
  const gapIds = new Set(exporting ? [] : data.unstaffedDepartmentIds);
  // Le nombre, lui, reste dans l'en-tête de l'export : celui qui partage l'image signale le manque.
  const unstaffedCount = data.unstaffedDepartmentIds.length;
  const gapDepartments = data.departments.filter((d) => gapIds.has(d.id));
  const ministries = groupByMinistry(data.departments);
  const gapAction: GapAction = {
    href: (deptId) => `/dashboard?dept=${deptId}&event=${eventId}`,
    verb: data.canEditPlanning ? "Planifier" : "Voir",
    icon: data.canEditPlanning ? CalendarPlus : Eye,
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Barre d'actions — masquée à l'impression */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <IconButton icon={ArrowLeft} aria-label="Retour" onClick={() => router.back()} />
        <ExportBar
          exporting={exporting}
          onCopy={copyImage}
          onDownload={downloadImage}
          onPdf={exportPdf}
          className="flex-1 justify-end"
        >
          {data.announcementSheet.filename && data.announcementSheet.canRead && (
            <Button variant="secondary" size="sm" onClick={downloadAnnouncementSheet} disabled={downloadingSheet}>
              <FileText aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {downloadingSheet ? "Préparation…" : "Télécharger la trame"}
            </Button>
          )}
          {data.audioLink && (
            <a
              href={data.audioLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses("secondary", "sm")}
            >
              <Headphones aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Écouter le culte
            </a>
          )}
        </ExportBar>
      </div>

      <PreparationBanner
        eventId={eventId}
        openingClosing={data.openingClosing}
        announcementSheet={data.announcementSheet}
        onOpeningClosingChange={(openingClosing) => setData((d) => (d ? { ...d, openingClosing } : d))}
        onAnnouncementSheetChange={(announcementSheet) =>
          setData((d) => (d ? { ...d, announcementSheet } : d))
        }
      />

      {/* Zone exportée (image, PDF) */}
      <div ref={printRef} className="overflow-hidden rounded-card border border-line bg-bg shadow-float">
        <div className="bg-brand px-5 py-5 text-on-brand sm:px-8">
          <p className="mb-1 text-xs font-semibold tracking-wide text-on-brand/70">{data.event.church.name}</p>
          <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-wide">{data.event.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm text-on-brand/80 first-letter:uppercase">{formatDate(data.event.date)}</p>
            <span className="rounded-full bg-on-brand/20 px-3 py-1 text-xs font-semibold">
              {data.totalStars} STAR en service
            </span>
            {unstaffedCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning">
                <TriangleAlert aria-hidden="true" className="size-3.5" strokeWidth={2} />
                {`${unstaffedCount} département${unstaffedCount > 1 ? "s" : ""} sans STAR planifié`}
              </span>
            )}
          </div>
          {data.event.welcomeDutyEnabled && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-on-brand/70">Accueil :</span>
              {data.welcomeFamilies.length === 0 ? (
                <span className="text-xs italic text-on-brand/60">Non affecté</span>
              ) : (
                data.welcomeFamilies.map((name) => (
                  <span key={name} className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-on-accent">
                    {name}
                  </span>
                ))
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-start gap-4">
            {(["opening", "closing"] as const).map((key) => (
              <div key={key} className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-on-brand/70">
                  {key === "opening" ? "Ouverture" : "Fermeture"} :
                </span>
                {data.openingClosing[key].length === 0 ? (
                  <span className="text-xs italic text-on-brand/60">Non pourvu</span>
                ) : (
                  data.openingClosing[key].map((a) => (
                    <span key={a.id} className="rounded-full bg-on-brand/20 px-3 py-1 text-xs font-semibold">
                      {a.member.firstName} {a.member.lastName}
                    </span>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-5 px-4 py-5 sm:px-5">
          {gapDepartments.length > 0 && (
            <Alert
              tone="warning"
              icon={TriangleAlert}
              title={`${gapDepartments.length} département${gapDepartments.length > 1 ? "s n'ont" : " n'a"} personne en service.`}
              action={gapDepartments.map((d) => (
                <GapActionLink key={d.id} action={gapAction} dept={d} withName />
              ))}
              className="print:hidden"
            >
              Ils sont prévus sur cet événement, mais aucun STAR n&apos;y est planifié.
            </Alert>
          )}

          {data.departments.length === 0 ? (
            <p className="py-6 text-center text-[15px] text-ink-muted">Aucun département n&apos;est prévu sur cet événement.</p>
          ) : (
            <>
              {activeDepartments.length === 0 && (
                <p className="text-center text-[15px] text-ink-muted">Aucun STAR n&apos;est encore en service pour cet événement.</p>
              )}
              {ministries.map((ministry) => (
                <section key={ministry.name} aria-label={ministry.name}>
                  <h2 className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                    {ministry.name}
                  </h2>
                  <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {ministry.departments.map((dept) => {
                      if (dept.members.length > 0) return <StaffedCard key={dept.id} dept={dept} />;
                      if (gapIds.has(dept.id)) return <GapCard key={dept.id} dept={dept} action={gapAction} />;
                      return <UnstaffedCard key={dept.id} dept={dept} />;
                    })}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Départements rangés par ministère (ordre alphabétique des ministères puis des départements). */
function groupByMinistry(departments: DepartmentItem[]): { name: string; departments: DepartmentItem[] }[] {
  const byName = new Map<string, DepartmentItem[]>();
  for (const dept of departments) {
    const list = byName.get(dept.ministryName) ?? [];
    list.push(dept);
    byName.set(dept.ministryName, list);
  }
  return [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "fr"))
    .map(([name, list]) => ({ name, departments: list.toSorted((a, b) => a.name.localeCompare(b.name, "fr")) }));
}

function StaffedCard({ dept }: { readonly dept: DepartmentItem }) {
  return (
    <div className="rounded-control border border-line border-l-[3px] border-l-brand bg-surface px-4 py-3">
      <h3 className="mb-2 truncate text-xs font-semibold text-brand-text first-letter:uppercase">{dept.name}</h3>
      <ul className="flex flex-col gap-1">
        {dept.members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
            <span className="min-w-0 break-words text-sm font-medium text-ink">
              {member.firstName} {member.lastName}
            </span>
            {member.status === "EN_SERVICE_DEBRIEF" && (
              <StatusChip tone="brand" icon={MessageSquare} className="shrink-0">
                Debrief
              </StatusChip>
            )}
            {member.status === "REMPLACANT" && (
              <StatusChip tone="info" icon={Repeat} className="shrink-0">
                Remplaçant
              </StatusChip>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Carte neutre : ce que voient un STAR, l'export partagé et l'impression. */
function UnstaffedCard({ dept }: { readonly dept: DepartmentItem }) {
  return (
    <div className="rounded-control border border-dashed border-line border-l-[3px] border-l-line bg-surface-sunken px-4 py-3">
      <h3 className="mb-1 truncate text-xs font-semibold text-ink-subtle first-letter:uppercase">{dept.name}</h3>
      <p className="text-sm italic text-ink-subtle">Pas de STAR planifié</p>
    </div>
  );
}

interface GapAction {
  readonly href: (deptId: string) => string;
  /** « Planifier » (planning:edit) ou « Voir » (grille en lecture seule). */
  readonly verb: string;
  readonly icon: LucideIcon;
}

/**
 * Lien vers la grille du département, en bouton `ghost` (Button.md : action d'une alerte ou d'une
 * carte). `withName` : le libellé nomme le département (bandeau d'alerte, plusieurs liens).
 */
function GapActionLink({
  action,
  dept,
  withName = false,
  className = "",
}: {
  readonly action: GapAction;
  readonly dept: DepartmentItem;
  readonly withName?: boolean;
  readonly className?: string;
}) {
  const Icon = action.icon;
  const label = withName ? `${action.verb} ${dept.name}` : action.verb;
  return (
    <Link
      href={action.href(dept.id)}
      aria-label={withName ? undefined : `${action.verb} ${dept.name}`}
      className={`${buttonClasses("ghost", "md")} print:hidden ${className}`}
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
      {label}
    </Link>
  );
}

/**
 * Carte d'alerte, à l'écran de qui peut planifier le département. À l'impression, elle reprend
 * l'aspect de la carte neutre.
 */
function GapCard({ dept, action }: { readonly dept: DepartmentItem; readonly action: GapAction }) {
  return (
    <div
      className="rounded-control border border-dashed border-warning/60 border-l-[3px] border-l-warning bg-warning-soft px-4 py-3
        print:border-line print:border-l-line print:bg-surface-sunken"
    >
      <h3 className="mb-1 truncate text-xs font-semibold text-warning first-letter:uppercase print:text-ink-subtle">{dept.name}</h3>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink print:hidden">
        <UserX aria-hidden="true" className="size-4 shrink-0 text-warning" strokeWidth={2} />
        Personne en service
      </p>
      <p className="hidden text-sm italic text-ink-subtle print:block">Pas de STAR planifié</p>
      <GapActionLink action={action} dept={dept} className="mt-2" />
    </div>
  );
}
