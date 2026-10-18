import Link from "next/link";
import { Presentation } from "lucide-react";
import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { getGivingSettings } from "@/modules/giving";
import { EmptyState, PageHeader } from "@/components/ui";
import { buttonClasses } from "@/components/ui/button-classes";
import GivingSlide from "./GivingSlide";
import { qrPath } from "./qr";

export default async function GivingSlidePage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;

  try {
    await requireChurchPermission("giving:manage", churchId);
  } catch {
    return <p className="p-4 text-ink-muted">Accès non autorisé.</p>;
  }

  const { churchName, content, publicUrl } = await getGivingSettings(churchId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Page de dons"
        title="Slide de projection"
        description="À projeter pendant le temps des offrandes : le QR code mène à la page de dons."
        actions={
          <Link href="/dons" className={buttonClasses("secondary")}>
            Paramétrage
          </Link>
        }
      />
      {content.enabled ? (
        <GivingSlide
          churchName={churchName}
          target={content.shortUrl ?? publicUrl}
          shortUrl={content.shortUrl}
          qr={qrPath(content.shortUrl ?? publicUrl)}
          transfer={content.transferEnabled}
          onsite={content.onsiteEnabled}
          checkPayee={content.onsiteEnabled ? content.checkPayee : null}
          verse={content.verseText ? { text: content.verseText, reference: content.verseReference } : null}
        />
      ) : (
        <EmptyState
          icon={Presentation}
          title="La page de dons n'est pas active"
          description="Active-la et enregistre-la : la slide renvoie vers elle."
          action={
            <Link href="/dons" className={buttonClasses("primary")}>
              Paramétrer la page
            </Link>
          }
        />
      )}
    </div>
  );
}
