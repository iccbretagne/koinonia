"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Headphones, MessageSquare, Repeat } from "lucide-react";
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
  welcomeFamilies: string[];
  audioLink: { url: string } | null;
  openingClosing: OpeningClosingData;
  announcementSheet: AnnouncementSheetData;
}

interface Props {
  readonly eventId: string;
}

export default function StarViewClient({ eventId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<StarViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "image" | "copy" | null>(null);
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
    fetchData();
  }, [fetchData]);

  function getExportFileName() {
    return `STAR-${data?.event.title || "export"}`;
  }

  // Force A4 landscape layout (1122px wide, desktop breakpoints) before html2canvas capture,
  // regardless of the current mobile viewport — restores original width in all cases.
  async function captureForExport(): Promise<HTMLCanvasElement | null> {
    if (!printRef.current) return null;
    const html2canvas = (await import("html2canvas-pro")).default;
    const el = printRef.current;
    const savedWidth = el.style.width;
    el.style.width = "1122px";
    // L'image partagée reste en thème clair, quel que soit le thème affiché.
    el.dataset.theme = "light";
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    try {
      return await html2canvas(el, { scale: 2, useCORS: true, windowWidth: 1440 });
    } finally {
      el.style.width = savedWidth;
      delete el.dataset.theme;
    }
  }

  async function copyImage() {
    if (!printRef.current || exporting) return;
    setExporting("copy");
    try {
      const canvas = await captureForExport();
      if (!canvas) return;

      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) resolve(b);
            else reject(new Error("toBlob failed"));
          }, "image/png");
        });

        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        toast.success("Image copiée dans le presse-papiers");
      } catch {
        const dataUrl = canvas.toDataURL("image/png");
        const w = window.open();
        if (w) {
          w.document.write(`<img src="${dataUrl}" />`);
          w.document.title = "STAR - copier l'image";
        } else {
          toast.error("Impossible de copier l'image. Vérifiez les permissions du navigateur.");
        }
      }
    } catch {
      toast.error("Export impossible. Réessayez dans un instant.");
    } finally {
      setExporting(null);
    }
  }

  async function downloadImage() {
    if (!printRef.current || exporting) return;
    setExporting("image");
    try {
      const canvas = await captureForExport();
      if (!canvas) return;

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `${getExportFileName()}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      toast.error("Export impossible. Réessayez dans un instant.");
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    if (!printRef.current || exporting) return;
    setExporting("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      const canvas = await captureForExport();
      if (!canvas) return;

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("landscape", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgRatio = canvas.height / canvas.width;

      let renderWidth = pdfWidth;
      let renderHeight = pdfWidth * imgRatio;

      if (renderHeight > pdfHeight) {
        renderHeight = pdfHeight;
        renderWidth = pdfHeight / imgRatio;
      }

      const offsetX = (pdfWidth - renderWidth) / 2;
      pdf.addImage(imgData, "PNG", offsetX, 0, renderWidth, renderHeight);
      pdf.save(`${getExportFileName()}.pdf`);
    } catch {
      toast.error("Export impossible. Réessayez dans un instant.");
    } finally {
      setExporting(null);
    }
  }

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

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
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
  const idleDepartments = data.departments.filter((d) => d.members.length === 0);

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

        <div className="px-4 py-5 sm:px-5">
          {activeDepartments.length === 0 ? (
            <p className="py-6 text-center text-[15px] text-ink-muted">Aucun STAR n&apos;est encore en service pour cet événement.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {activeDepartments.map((dept) => (
                <div key={dept.id} className="rounded-control border border-line border-l-[3px] border-l-brand bg-surface px-4 py-3">
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
              ))}
            </div>
          )}

          {idleDepartments.length > 0 && (
            <p className="mt-4 border-t border-line pt-3 text-xs text-ink-muted">
              <span className="font-semibold">Non mobilisés : </span>
              {idleDepartments.map((d) => d.name).join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
