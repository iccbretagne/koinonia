import Link from "next/link";
import { Plus } from "lucide-react";
import { getCurrentChurchId, requireAuth, requireChurchPermission } from "@/lib/auth";
import { PageHeader, Tabs } from "@/components/ui";
import { buttonClasses } from "@/components/ui/button-classes";
import { listMessages, type MessageStatus } from "@/modules/messages";
import MessagesClient from "./MessagesClient";

const TABS: { key: string; status: MessageStatus; label: string }[] = [
  { key: "en-cours", status: "active", label: "En cours" },
  { key: "programmes", status: "scheduled", label: "Programmés" },
  { key: "passes", status: "past", label: "Passés" },
];

/** Messages système de l'église (spec 071) : Super Admin, Admin et Secrétaire. */
export default async function SystemMessagesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ etat?: string }>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("messages:publish", churchId);

  const { etat } = await searchParams;
  const tab = TABS.find((t) => t.key === etat) ?? TABS[0];
  const messages = await listMessages(churchId, { isSuperAdmin: Boolean(session.user.isSuperAdmin) });
  const counts = Object.fromEntries(TABS.map((t) => [t.key, messages.filter((m) => m.status === t.status).length]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administration"
        title="Messages système"
        description="Un bandeau en haut de Koinonia et une notification pour les personnes choisies, le temps de la période."
        actions={
          <Link href="/admin/messages/new" className={buttonClasses("primary", "md")}>
            <Plus aria-hidden="true" className="size-4" />
            Nouveau message
          </Link>
        }
      >
        <Tabs
          ariaLabel="État des messages"
          tabs={TABS.map((t) => ({
            href: `/admin/messages?etat=${t.key}`,
            label: t.label,
            count: counts[t.key],
            active: t.key === tab.key,
          }))}
        />
      </PageHeader>
      <MessagesClient messages={messages.filter((m) => m.status === tab.status)} status={tab.status} />
    </div>
  );
}
