import { z } from "zod";
import Link from "next/link";
import { requireAuth, requireChurchPermission, getCurrentChurchId } from "@/lib/auth";
import { listPublishedServices, listSpeakers, listSeries } from "@/modules/audio";
import { EVENT_TYPE_OPTIONS, getEventTypeLabel } from "@/lib/event-types";
import LibraryFiltersClient from "./LibraryFiltersClient";
import ResumeBanner from "./ResumeBanner";
import Button from "@/components/ui/Button";

const searchParamsSchema = z.object({
  q: z.string().trim().min(1).optional().catch(undefined),
  speaker: z.string().trim().min(1).optional().catch(undefined),
  series: z.string().trim().min(1).optional().catch(undefined),
  type: z.string().trim().min(1).optional().catch(undefined),
  from: z.string().trim().min(1).optional().catch(undefined),
  to: z.string().trim().min(1).optional().catch(undefined),
  sort: z.enum(["recent", "oldest", "speaker"]).optional().catch(undefined),
});

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h${minutes.toString().padStart(2, "0")}` : `${minutes} min`;
}

export default async function AudioLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("audio:listen", churchId);

  const rawParams = await searchParams;
  // Une URL bricolée retombe sur les valeurs par défaut plutôt que de casser la page (plan.md).
  const parsed = searchParamsSchema.safeParse(
    Object.fromEntries(Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))
  );
  const filters = parsed.success ? parsed.data : {};

  const hasActiveFilters = Boolean(filters.q || filters.speaker || filters.series || filters.type || filters.from || filters.to);

  const [services, speakers, series] = await Promise.all([
    listPublishedServices({
      churchId,
      q: filters.q,
      speaker: filters.speaker,
      series: filters.series,
      type: filters.type,
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(filters.to) : undefined,
      sort: filters.sort,
    }),
    listSpeakers(churchId),
    listSeries(churchId),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">(re)Écouter</h1>

      <LibraryFiltersClient
        speakers={speakers}
        seriesOptions={series}
        typeOptions={EVENT_TYPE_OPTIONS}
        current={{
          q: filters.q ?? "",
          speaker: filters.speaker ?? "",
          series: filters.series ?? "",
          type: filters.type ?? "",
          from: filters.from ?? "",
          to: filters.to ?? "",
          sort: filters.sort ?? "recent",
        }}
      />

      <ResumeBanner
        services={services.map((s) => ({
          id: s.id,
          title: s.title,
          serviceDate: s.serviceDate.toISOString(),
          segmentIds: s.segmentIds,
        }))}
      />

      {services.length === 0 ? (
        <div className="text-center py-16 px-4">
          {hasActiveFilters ? (
            <>
              <p className="text-gray-500 mb-4">Aucun résultat pour cette recherche.</p>
              <Link href="/audio/ecouter">
                <Button variant="secondary" size="sm">Voir tous les enregistrements</Button>
              </Link>
            </>
          ) : (
            <p className="text-gray-500">Aucun enregistrement publié pour l&apos;instant.</p>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <li key={s.id}>
              <Link
                href={`/audio/ecouter/${s.id}`}
                className="block bg-white rounded-xl shadow border-2 border-gray-100 p-4 hover:border-icc-violet/40 transition-colors h-full"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-icc-violet/10 text-icc-violet">
                    {getEventTypeLabel(s.type)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(s.serviceDate).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                <p className="font-semibold text-gray-900 mb-1 line-clamp-2">
                  {s.title || "Enregistrement du culte"}
                </p>
                {s.speaker && <p className="text-sm text-gray-500 mb-2">{s.speaker}</p>}
                {s.series && (
                  <p className="text-xs text-icc-violet mb-2">Série : {s.series}</p>
                )}
                <p className="text-xs text-gray-400">
                  {s.segmentCount} séquence{s.segmentCount > 1 ? "s" : ""} · {formatDuration(s.totalDurationMs)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
