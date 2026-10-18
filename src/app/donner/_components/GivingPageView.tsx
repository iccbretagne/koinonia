import type { ReactNode } from "react";
import { ArrowUpRight, CreditCard, FileText, Info, Landmark, Mail, type LucideIcon } from "lucide-react";
import { buttonClasses } from "@/components/ui/button-classes";
import { formatIban, type PublicGivingPage } from "@/modules/giving/schemas";
import CopyRow from "./CopyRow";

const NAME_PLACEHOLDER = "Prénom Nom";

function SectionCard({
  icon: Icon,
  iconClass,
  title,
  children,
}: {
  readonly icon: LucideIcon;
  readonly iconClass: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${iconClass}`}>
          <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        </span>
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** Met en valeur « Prénom Nom » dans le libellé de virement, à remplacer par le donateur. */
function ReferenceDisplay({ reference }: { readonly reference: string }) {
  const at = reference.indexOf(NAME_PLACEHOLDER);
  if (at < 0) return <>{reference}</>;
  return (
    <>
      {reference.slice(0, at)}
      <em className="text-warning">{NAME_PLACEHOLDER}</em>
      {reference.slice(at + NAME_PLACEHOLDER.length)}
    </>
  );
}

/**
 * Page de dons d'une église (spec 065), à partir des données déjà projetées : seules les
 * sections activées sont reçues. Sans état ni API serveur, elle sert à la fois la page publique
 * et l'aperçu du paramétrage. Tous les textes sont rendus échappés, jamais en HTML.
 */
export default function GivingPageView({ page }: { readonly page: PublicGivingPage }) {
  const { online, transfer, onsite, taxReceipt, verse, footer } = page;
  const hasFooter = Boolean(footer.contactEmail || footer.address || footer.socialHandle);

  return (
    <div className="flex flex-col gap-4">
      {page.intro && <p className="text-[15px] leading-[22px] text-ink-muted">{page.intro}</p>}

      {online && (
        <SectionCard icon={CreditCard} iconClass="bg-brand-soft text-brand-text" title="Don en ligne">
          {online.description && <p className="mb-4 text-[15px] leading-[22px] text-ink-muted">{online.description}</p>}
          <a
            href={online.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonClasses("primary")} w-full`}
          >
            Donner maintenant
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </a>
          {online.note && <p className="mt-3 text-center text-[13px] leading-[18px] text-ink-subtle">{online.note}</p>}
        </SectionCard>
      )}

      {transfer && (
        <SectionCard icon={Landmark} iconClass="bg-info-soft text-info" title="Virement bancaire">
          <p className="mb-2 text-[15px] leading-[22px] text-ink-muted">
            Appuie sur « Copier », puis colle dans ton application bancaire.
          </p>
          <div>
            <CopyRow label="Bénéficiaire" display={transfer.beneficiary} value={transfer.beneficiary} />
            <CopyRow label="IBAN" display={formatIban(transfer.iban)} value={transfer.iban} mono />
            {transfer.bic && <CopyRow label="BIC" display={transfer.bic} value={transfer.bic} mono />}
            {transfer.reference && (
              <CopyRow
                label="Libellé du virement"
                display={<ReferenceDisplay reference={transfer.reference} />}
                value={transfer.reference}
              />
            )}
          </div>
          {transfer.reference?.includes(NAME_PLACEHOLDER) && (
            <div className="mt-3 flex items-start gap-3 rounded-control bg-warning-soft px-4 py-3 text-[15px] leading-[22px] text-ink">
              <Info aria-hidden="true" className="mt-px size-5 shrink-0 text-warning" strokeWidth={1.75} />
              <p>
                <strong className="font-semibold">Remplace « {NAME_PLACEHOLDER} » par ton nom.</strong> Sans lui, ton don ne
                peut pas être rattaché ni donner lieu à un reçu fiscal.
              </p>
            </div>
          )}
        </SectionCard>
      )}

      {onsite && (
        <SectionCard icon={Mail} iconClass="bg-success-soft text-success" title="Sur place, au culte">
          <div className="flex flex-col gap-2 text-[15px] leading-[22px] text-ink">
            <p>
              Chèque à l&apos;ordre de <strong className="font-semibold">{onsite.checkPayee}</strong>.
            </p>
            {onsite.text && <p className="text-ink-muted">{onsite.text}</p>}
          </div>
        </SectionCard>
      )}

      {taxReceipt && (
        <SectionCard icon={FileText} iconClass="bg-warning-soft text-warning" title="Reçu fiscal">
          <p className="whitespace-pre-line text-[15px] leading-[22px] text-ink-muted">{taxReceipt.text}</p>
        </SectionCard>
      )}

      {verse && (
        <figure className="px-2 py-4 text-center">
          <blockquote className="font-display text-[17px] italic leading-6 text-ink">« {verse.text} »</blockquote>
          {verse.reference && (
            <figcaption className="mt-2 text-[13px] font-semibold leading-[18px] text-ink-muted">{verse.reference}</figcaption>
          )}
        </figure>
      )}

      {hasFooter && (
        <footer className="flex flex-col gap-2 border-t border-line pt-4 text-center text-[13px] leading-[18px] text-ink-muted">
          {footer.contactEmail && (
            <p>
              Une question sur ton don ou ton reçu ?<br />
              <a className="font-semibold text-brand-text underline-offset-2 hover:underline" href={`mailto:${footer.contactEmail}`}>
                {footer.contactEmail}
              </a>
            </p>
          )}
          {footer.address && <p>{footer.address}</p>}
          {footer.socialHandle && <p>{footer.socialHandle}</p>}
        </footer>
      )}
    </div>
  );
}
