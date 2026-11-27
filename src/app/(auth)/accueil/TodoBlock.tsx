import Link from "next/link";
import type { Session } from "next-auth";
import { ChevronRight } from "lucide-react";
import { hasChurchPermission } from "@/lib/auth";
import { registry, rolePermissions } from "@/lib/registry";
import StatusChip from "@/components/ui/StatusChip";
import { paths } from "@/lib/paths";
import { countRequestQueueTodo, listPendingWithdrawals, resolveRequestQueueAccess } from "@/modules/planning";
import { accountingQueueCounts } from "@/modules/accounting";
import { careQueueCounts, getCareAccess } from "@/modules/care";
import { countPendingDeclarations } from "@/modules/ticketing";
import { countSubmittedContributions } from "@/modules/campaigns";
import { countServingQueue } from "@/modules/serving";
import { servingActorFromSession } from "@/modules/serving/auth";

/**
 * Bloc « À traiter » de l'Accueil (spec 092, lot 2). Chaque file reprend **la fonction de compte de
 * son écran** et sa condition d'accès, la moins chère d'abord (module actif, permission, puis
 * requête). Une file inaccessible n'apparaît pas (jamais de « 0 » pour une file qu'on ne peut pas
 * ouvrir) ; une file accessible et vide affiche « 0 ». Une file en erreur disparaît seule. Seuls des
 * nombres sont rendus, sauf pour les remplacements : date, événement et département (rien de
 * nominatif).
 */

export interface TodoItem {
  readonly id: string;
  readonly label: string;
  readonly meta: string;
  readonly href: string;
}

export interface TodoQueue {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly href: string;
  readonly items?: readonly TodoItem[];
}

type Loaded = TodoQueue | readonly TodoQueue[] | null;

const MAX_REPLACEMENTS = 5;

/** Isole une file : une erreur la retire sans casser l'Accueil. */
function safe(load: () => Promise<Loaded>): Promise<Loaded> {
  return load().catch(() => null);
}

function churchPermissions(session: Session, churchId: string): Set<string> {
  return new Set(
    session.user.churchRoles.filter((r) => r.churchId === churchId).flatMap((r) => rolePermissions[r.role] ?? [])
  );
}

const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" });

/** Demandes du secrétariat : même accès et même compte que `secretariat/requests`. */
async function secretariatQueue(session: Session, churchId: string): Promise<Loaded> {
  if (!registry.has("planning")) return null;
  if (!(await hasChurchPermission(session, "planning:view", churchId))) return null;
  const access = await resolveRequestQueueAccess(session, churchId, "SECRETARIAT");
  if (!access.configured || !access.allowed) return null;
  const count = await countRequestQueueTodo(churchId, "SECRETARIAT");
  return { key: "secretariat", label: "Demandes du secrétariat", count, href: paths.secretariat.requests() };
}

/** Comptabilité : `accounting:manage` des rôles de l'église, comme `accounting/requests`. */
async function accountingQueues(session: Session, churchId: string): Promise<Loaded> {
  if (!registry.has("accounting")) return null;
  if (!churchPermissions(session, churchId).has("accounting:manage")) return null;
  const q = await accountingQueueCounts(churchId);
  return [
    { key: "accounting-validate", label: "Demandes comptables à valider", count: q.submitted + q.processing, href: paths.accounting.requests() },
    { key: "accounting-pay", label: "Remises à effectuer", count: q.toPay, href: paths.accounting.requests() },
    {
      key: "accounting-justify",
      label: "Justificatifs à examiner",
      count: q.toJustify,
      href: paths.accounting.requests({ filtre: "justifier" }),
    },
  ];
}

/** Suivi pastoral : `care:qualify` (`getCareAccess`), mêmes pastilles que les onglets de `/care`. */
async function careQueue(session: Session, churchId: string): Promise<Loaded> {
  if (!registry.has("care")) return null;
  const access = await getCareAccess(session, churchId);
  const counts = await careQueueCounts(access, churchId);
  if (!counts) return null;
  return { key: "care", label: "Rendez-vous et suivis à confier", count: counts.requests + counts.followUps, href: paths.care() };
}

/** Règlements de billetterie déclarés, sur les événements où l'on a le geste `payments`. */
async function ticketingQueue(session: Session, churchId: string): Promise<Loaded> {
  if (!registry.has("ticketing")) return null;
  const pending = await countPendingDeclarations(session, churchId);
  if (!pending) return null;
  const href =
    pending.perEvent.length === 1
      ? paths.billetterie.event(pending.perEvent[0].eventId, { vue: "reglements" })
      : paths.billetterie({ "a-traiter": "reglements" });
  return { key: "ticketing", label: "Règlements à confirmer", count: pending.count, href };
}

/** Remplacements demandés : `planning:edit` et périmètre de responsabilité. */
async function replacementsQueue(session: Session, churchId: string): Promise<Loaded> {
  if (!registry.has("planning")) return null;
  const pending = await listPendingWithdrawals(session, churchId, { take: MAX_REPLACEMENTS });
  if (!pending) return null;
  const items = pending.items.map((w) => ({
    id: w.id,
    label: w.eventTitle,
    meta: `${dayFormat.format(w.date)} · ${w.departmentName}`,
    href: paths.planning.remplacement(w.id),
  }));
  return {
    key: "replacements",
    label: "Remplacements à trouver",
    count: pending.count,
    href: items[0]?.href ?? paths.dashboard(),
    items,
  };
}

/** Questionnaires soumis à valider dans les campagnes que l'on pilote. */
async function campaignsQueue(session: Session, churchId: string): Promise<Loaded> {
  if (!registry.has("campaigns")) return null;
  const submitted = await countSubmittedContributions(session, churchId);
  if (!submitted) return null;
  const href =
    submitted.perCampaign.length === 1
      ? paths.collectes.campaign(submitted.perCampaign[0].campaignId, { onglet: "suivi", etat: "soumis" })
      : paths.collectes({ "a-valider": 1 });
  return { key: "campaigns", label: "Questionnaires à valider", count: submitted.count, href };
}

/** Candidatures au service : équipe Vie des STAR, Admin, ou responsable d'un département affecté. */
async function servingQueue(session: Session, churchId: string): Promise<Loaded> {
  if (!registry.has("serving")) return null;
  if (!session.user.isSuperAdmin && !session.user.churchRoles.some((r) => r.churchId === churchId)) return null;
  const queue = await countServingQueue(await servingActorFromSession(session, churchId));
  if (!queue) return null;
  return {
    key: "serving",
    label: "Candidatures à traiter",
    count: queue.count,
    href: paths.candidatures({ onglet: queue.view === "pvs" ? "todo" : "departments" }),
  };
}

/** Les files accessibles, dans un ordre fixe, calculées en parallèle. */
export async function loadTodoQueues(session: Session, churchId: string): Promise<TodoQueue[]> {
  const loaded = await Promise.all(
    [secretariatQueue, accountingQueues, careQueue, ticketingQueue, replacementsQueue, campaignsQueue, servingQueue].map((load) =>
      safe(() => load(session, churchId))
    )
  );
  return loaded.flatMap((q) => (q === null ? [] : Array.isArray(q) ? q : [q as TodoQueue]));
}

function CountChip({ count }: { readonly count: number }) {
  return (
    <StatusChip tone={count > 0 ? "warning" : "neutral"} className="shrink-0 tabular-nums">
      {count}
    </StatusChip>
  );
}

const rowLinkClasses =
  "flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

export default async function TodoBlock({ session, churchId }: { readonly session: Session; readonly churchId: string }) {
  const queues = await loadTodoQueues(session, churchId);
  if (queues.length === 0) return null;

  return (
    <section aria-labelledby="today-todo" className="flex flex-col gap-3">
      <h2 id="today-todo" className="font-display text-[17px] font-semibold leading-6 text-ink">
        À traiter
      </h2>
      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {queues.map((q) => (
          <li key={q.key} className="border-t border-line first:border-t-0">
            <Link href={q.href} className={rowLinkClasses}>
              <span className="min-w-0 flex-1 text-[15px] font-semibold leading-[22px] text-ink">{q.label}</span>
              <CountChip count={q.count} />
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
            </Link>
            {q.items && q.items.length > 0 && (
              <ul className="border-t border-line bg-surface-sunken">
                {q.items.map((item) => (
                  <li key={item.id} className="border-t border-line first:border-t-0">
                    <Link href={item.href} className={`${rowLinkClasses} pl-8`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] leading-[22px] text-ink">{item.label}</span>
                        <span className="block truncate text-[13px] leading-[18px] text-ink-muted">{item.meta}</span>
                      </span>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
