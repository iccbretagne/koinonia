import { forbidden } from "next/navigation";
import Link from "next/link";
import { Presentation } from "lucide-react";
import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { getGivingSettings } from "@/modules/giving";
import { EmptyState, PageHeader, buttonClasses } from "@/components/ui";
import GivingSlide from "./GivingSlide";
import { qrPath } from "@/lib/qr";
import { toSlideProps } from "./slide-props";
import { paths } from "@/lib/paths";

export default async function GivingSlidePage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;

  try {
    await requireChurchPermission("giving:manage", churchId);
  } catch {
    forbidden();
  }

  const { churchName, content, publicUrl, publicLogoSrc } = await getGivingSettings(churchId);
  const slide = toSlideProps(content, { churchName, publicUrl, logoSrc: publicLogoSrc });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Page de dons"
        title="Slide de projection"
        description="À projeter pendant le temps des offrandes : le QR code mène à la page de dons."
        actions={
          <Link href={paths.dons({ support: "slide" })} className={buttonClasses("secondary")}>
            Paramétrer la slide
          </Link>
        }
      />
      {content.enabled ? (
        <GivingSlide {...slide} qr={qrPath(slide.target)} />
      ) : (
        <EmptyState
          icon={Presentation}
          title="La page de dons n'est pas active"
          description="Active-la et enregistre-la : la slide renvoie vers elle."
          action={
            <Link href={paths.dons()} className={buttonClasses("primary")}>
              Paramétrer la page
            </Link>
          }
        />
      )}
    </div>
  );
}
