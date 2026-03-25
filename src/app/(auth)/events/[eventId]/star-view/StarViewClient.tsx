"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

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
  };
  departments: DepartmentItem[];
  totalStars: number;
}

interface Props {
  eventId: string;
}

export default function StarViewClient({ eventId }: Props) {
  const router = useRouter();
  const [data, setData] = useState<StarViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "image" | "copy" | null>(null);
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

  async function copyImage() {
    if (!printRef.current || exporting) return;
    setExporting("copy");
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
      });

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
        alert("Image copiée dans le presse-papier");
      } catch {
        const dataUrl = canvas.toDataURL("image/png");
        const w = window.open();
        if (w) {
          w.document.write(`<img src="${dataUrl}" />`);
          w.document.title = "STAR - copier l'image";
        } else {
          alert("Impossible de copier l'image. Vérifiez les permissions du navigateur.");
        }
      }
    } catch {
      // ignore export errors
    } finally {
      setExporting(null);
    }
  }

  async function downloadImage() {
    if (!printRef.current || exporting) return;
    setExporting("image");
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
      });

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `${getExportFileName()}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // ignore export errors
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    if (!printRef.current || exporting) return;
    setExporting("pdf");
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
      });
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
      // ignore export errors
    } finally {
      setExporting(null);
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
    return <div className="p-8 text-center text-gray-400">Chargement...</div>;
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-red-500">
        Impossible de charger les donnees
      </div>
    );
  }

  return (
    <div>
      {/* Action bar - hidden on print */}
      <div className="mb-6 flex flex-wrap items-center gap-2 md:gap-3 print:hidden">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          title="Retour"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={copyImage}
          disabled={!!exporting}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-icc-violet rounded-lg hover:bg-icc-violet/90 disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
          {exporting === "copy" ? "Copie..." : "Copier image"}
        </button>
        <button
          onClick={downloadImage}
          disabled={!!exporting}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-icc-violet border-2 border-icc-violet rounded-lg hover:bg-icc-violet/10 disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {exporting === "image" ? "Export..." : "Télécharger PNG"}
        </button>
        <button
          onClick={exportPdf}
          disabled={!!exporting}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-icc-violet border-2 border-icc-violet rounded-lg hover:bg-icc-violet/10 disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {exporting === "pdf" ? "Export..." : "Export PDF"}
        </button>
      </div>

      {/* Printable zone */}
      <div ref={printRef} className="rounded-2xl overflow-hidden shadow-xl">
        {/* Header — split design: violet left + jaune right */}
        <div className="relative flex">
          {/* Left block — violet with event info */}
          <div className="flex-1 bg-icc-violet px-8 py-6">
            <p className="text-icc-jaune text-xs font-bold uppercase tracking-widest mb-2">
              {data.event.church.name}
            </p>
            <h1 className="text-white text-2xl font-black uppercase tracking-wide leading-tight">
              {data.event.title}
            </h1>
            <p className="text-white/60 text-sm mt-1.5 capitalize">
              {formatDate(data.event.date)}
            </p>
          </div>
          {/* Right block — jaune with count */}
          <div className="bg-icc-jaune px-8 py-6 flex flex-col items-center justify-center shrink-0">
            <span className="text-4xl font-black text-icc-violet leading-none">
              {data.totalStars}
            </span>
            <span className="text-[10px] font-bold text-icc-violet/70 uppercase tracking-widest mt-1">
              STAR
            </span>
          </div>
        </div>

        {/* Separator */}
        <div className="h-1 bg-icc-jaune" />

        {/* Department grid */}
        <div className="bg-icc-violet px-5 py-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.departments.map((dept) => (
            <div
              key={dept.id}
              className="bg-white/95 rounded-lg overflow-hidden"
            >
              {/* Department name inline */}
              <div className="px-4 pt-3 pb-1.5">
                <h3 className="text-[11px] font-black text-icc-violet uppercase tracking-widest leading-tight truncate border-b-2 border-icc-jaune pb-1.5 inline-block">
                  {dept.name}
                </h3>
              </div>

              {/* Members */}
              <div className="px-4 pb-3">
                {dept.members.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">
                    (aucun STAR en service)
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {dept.members.map((member) => (
                      <li key={member.id} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-gray-800 font-semibold truncate">
                          {member.firstName} {member.lastName}
                        </span>
                        {member.status === "EN_SERVICE_DEBRIEF" && (
                          <span className="text-[11px] bg-icc-jaune text-icc-violet px-2.5 py-0.5 rounded-full font-bold shrink-0">
                            Debrief
                          </span>
                        )}
                        {member.status === "REMPLACANT" && (
                          <span className="text-[11px] bg-white text-icc-violet border border-icc-violet/30 px-2.5 py-0.5 rounded-full font-semibold shrink-0">
                            Remplaçant
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
