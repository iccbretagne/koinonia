import type { CSSProperties, ReactNode } from "react";
import { UserRound } from "lucide-react";
import { dateAndPlace } from "@/components/ticketing/format";
import { AGE_GROUP_LABEL, formatEuros } from "@/modules/ticketing/schemas";
import type { PublicEvent, SiteBlock, SiteDocument, SiteSection } from "@/modules/ticketing/schemas";
import Countdown from "./Countdown";
import RichText from "./RichText";
import { fontClasses } from "./fonts";
import { backdropLayers, colorVar, themeStyle } from "./theme";

/**
 * Rendu d'un site d'événement (spec 084), partagé par le site public et l'aperçu de l'éditeur :
 * mêmes composants, donc aucun écart entre l'aperçu et la publication. Aucun HTML stocké ni
 * `dangerouslySetInnerHTML` : chaque bloc est un composant React ; le style vient de variables CSS
 * calculées du thème et d'énumérations traduites dans `theme.ts`.
 */

export interface SiteRenderProps {
  readonly document: SiteDocument;
  /** `null` : événement clôturé, ou données indisponibles. */
  readonly event: PublicEvent | null;
  readonly title: string;
  readonly churchSlug: string;
  readonly eventSlug: string;
  readonly ended: boolean;
  /** Page affichée ; la première (accueil) par défaut. */
  readonly pageSlug?: string;
  readonly assetUrl: (id: string) => string;
  readonly pageHref: (slug: string) => string;
  /** Aperçu de l'éditeur : navigation sans changer d'adresse. */
  readonly onNavigate?: (slug: string) => void;
  readonly fullHeight?: boolean;
}

type Ctx = Pick<SiteRenderProps, "event" | "title" | "churchSlug" | "eventSlug" | "assetUrl" | "pageHref">;

function Backdrop({ background, assetUrl }: { readonly background: SiteSection["background"]; readonly assetUrl: Ctx["assetUrl"] }) {
  return (
    <>
      {backdropLayers(background, assetUrl).map((layer) => (
        <div key={layer.key} aria-hidden="true" className="pointer-events-none absolute inset-0" style={layer.style} />
      ))}
    </>
  );
}

const bookingHref = (ctx: Ctx) => `/inscription/${ctx.churchSlug}/${ctx.eventSlug}`;
const buttonClass = "inline-block rounded-full px-6 py-3 font-semibold no-underline";
const buttonStyle: CSSProperties = { backgroundColor: colorVar("primary"), color: "var(--site-on-primary)", fontFamily: "var(--site-font-heading)" };

function BookingButton({ ctx, label }: { readonly ctx: Ctx; readonly label?: string }) {
  if (ctx.event && !ctx.event.open) return <p className="font-semibold">{ctx.event.closedReason ?? "Inscriptions fermées"}</p>;
  return (
    <a href={bookingHref(ctx)} className={buttonClass} style={buttonStyle}>
      {label || "Je m'inscris"}
    </a>
  );
}

function Heading({ children, as: Tag = "h2" }: { readonly children: ReactNode; readonly as?: "h1" | "h2" | "h3" }) {
  return <Tag className="text-2xl font-bold" style={{ fontFamily: "var(--site-font-heading)" }}>{children}</Tag>;
}

function Items({ items }: { readonly items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-6">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Block({ block, ctx }: { readonly block: SiteBlock; readonly ctx: Ctx }) {
  switch (block.kind) {
    case "hero":
      return (
        <div className="space-y-4 py-10 text-center">
          <h1 className="text-4xl font-bold sm:text-5xl" style={{ fontFamily: "var(--site-font-heading)" }}>{block.title}</h1>
          {block.tagline && <p className="text-lg">{block.tagline}</p>}
          {block.showDateLocation && ctx.event && <p className="font-semibold">{dateAndPlace(ctx.event.startsAt, ctx.event.location)}</p>}
          {block.showCountdown && ctx.event && <Countdown target={ctx.event.startsAt} />}
          <div className="pt-2"><BookingButton ctx={ctx} label={block.buttonLabel} /></div>
        </div>
      );
    case "richText":
      return <RichText nodes={block.content} pageHref={ctx.pageHref} />;
    case "image":
      // eslint-disable-next-line @next/next/no-img-element -- image du site servie par l'API, dimensions déclarées par l'organisateur
      return <figure><img src={ctx.assetUrl(block.image.assetId)} alt={block.image.alt} loading="lazy" className="w-full rounded-lg" />{block.image.caption && <figcaption className="mt-1 text-sm">{block.image.caption}</figcaption>}</figure>;
    case "gallery":
      return (
        <div className="space-y-3">
          {block.title && <Heading>{block.title}</Heading>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {block.images.map((image, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- image du site servie par l'API
              <img key={i} src={ctx.assetUrl(image.assetId)} alt={image.alt} loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
            ))}
          </div>
        </div>
      );
    case "palette":
      return (
        <div className="space-y-3">
          {block.title && <Heading>{block.title}</Heading>}
          <ul className="flex flex-wrap gap-4">
            {block.swatches.map((swatch, i) => (
              <li key={i} className="text-center text-sm">
                { }
                <span className="mx-auto mb-1 block size-14 rounded-full border border-current" style={{ backgroundColor: swatch.color }} />
                {swatch.label}
              </li>
            ))}
          </ul>
        </div>
      );
    case "cards":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          {block.cards.map((card, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-current p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- image du site servie par l'API */}
              {card.image && <img src={ctx.assetUrl(card.image.assetId)} alt={card.image.alt} loading="lazy" className="w-full rounded" />}
              <Heading as="h3">{card.title}</Heading>
              <Items items={card.items} />
            </div>
          ))}
        </div>
      );
    case "doDont":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Heading as="h3">{block.doTitle}</Heading><Items items={block.doItems} /></div>
          <div><Heading as="h3">{block.dontTitle}</Heading><Items items={block.dontItems} /></div>
        </div>
      );
    case "icons":
      return (
        <div className="space-y-3">
          {block.title && <Heading>{block.title}</Heading>}
          <Items items={block.items.map((i) => i.label)} />
        </div>
      );
    case "faq":
      return (
        <div className="space-y-2">
          {block.items.map((item, i) => (
            <details key={i} className="rounded-lg border border-current p-3">
              <summary className="cursor-pointer font-semibold">{item.question}</summary>
              <p className="mt-2 whitespace-pre-line">{item.answer}</p>
            </details>
          ))}
        </div>
      );
    case "button":
      return (
        <div className="text-center">
          {"booking" in block.target ? (
            <BookingButton ctx={ctx} label={block.label} />
          ) : (
            <a href={ctx.pageHref(block.target.page)} className={buttonClass} style={buttonStyle}>{block.label}</a>
          )}
        </div>
      );
    case "banner":
      return (
        <div className="relative isolate overflow-hidden rounded-lg px-6 py-10 text-center">
          <Backdrop background={block.background} assetUrl={ctx.assetUrl} />
          <div className="relative space-y-2">
            <Heading>{block.title}</Heading>
            {block.tagline && <p>{block.tagline}</p>}
          </div>
        </div>
      );
    case "separator":
      return block.style === "line" ? (
        <hr className="border-current opacity-40" />
      ) : (
        <p aria-hidden="true" className="text-center text-xl opacity-70">{block.style === "goldDiamond" ? "◆" : "〰〰〰"}</p>
      );
  }
}

function Section({ section, ctx }: { readonly section: SiteSection; readonly ctx: Ctx }) {
  return (
    <section className="relative isolate px-4 py-8" style={{ color: colorVar(section.textColor) }}>
      <Backdrop background={section.background} assetUrl={ctx.assetUrl} />
      <div className="relative mx-auto max-w-3xl space-y-6">
        {section.blocks.map((block, i) => (
          <Block key={i} block={block} ctx={ctx} />
        ))}
      </div>
    </section>
  );
}

function Plain({ children }: { readonly children: ReactNode }) {
  return <section className="mx-auto max-w-3xl space-y-6 px-4 py-8">{children}</section>;
}

function TicketsPage({ ctx }: { readonly ctx: Ctx }) {
  const event = ctx.event;
  if (!event) return null;
  return (
    <Plain>
      <Heading>Billetterie</Heading>
      <ul className="divide-y divide-current/20 rounded-lg border border-current">
        {event.tariffs.map((t) => (
          <li key={t.ageGroup} className="flex justify-between gap-4 p-3"><span>{AGE_GROUP_LABEL[t.ageGroup]}</span><strong>{t.price > 0 ? formatEuros(t.price) : "Gratuit"}</strong></li>
        ))}
        {event.options.map((o) => (
          <li key={o.id} className="flex justify-between gap-4 p-3"><span>{o.label}</span><strong>{o.price > 0 ? formatEuros(o.price) : "Inclus"}</strong></li>
        ))}
      </ul>
      <p>{event.seatsRemaining > 0 ? `${event.seatsRemaining} place${event.seatsRemaining > 1 ? "s" : ""} restante${event.seatsRemaining > 1 ? "s" : ""}` : "Complet"}</p>
      <BookingButton ctx={ctx} />
    </Plain>
  );
}

function MenusPage({ ctx }: { readonly ctx: Ctx }) {
  const options = (ctx.event?.options ?? []).filter((o) => o.variants.length > 0);
  return (
    <Plain>
      <Heading>Menus</Heading>
      {options.length === 0 && <p>Le menu sera communiqué prochainement.</p>}
      {options.map((o) => (
        <div key={o.id} className="space-y-1">
          <Heading as="h3">{o.label}</Heading>
          <Items items={o.variants.map((v) => v.label)} />
        </div>
      ))}
    </Plain>
  );
}

function PracticalPage({ ctx }: { readonly ctx: Ctx }) {
  const event = ctx.event;
  return (
    <Plain>
      <Heading>Infos pratiques</Heading>
      {event && <p className="font-semibold">{dateAndPlace(event.startsAt, event.location)}</p>}
      {event?.description && <p className="whitespace-pre-line">{event.description}</p>}
    </Plain>
  );
}

export default function SiteRenderer(props: SiteRenderProps) {
  const { document: doc, ended, pageSlug, onNavigate } = props;
  const ctx: Ctx = props;
  const page = doc.pages.find((p) => p.slug === (pageSlug ?? doc.pages[0].slug)) ?? doc.pages[0];
  const { theme } = doc;
  const menu = doc.pages.filter((p) => p.inMenu);

  return (
    <div
      className={`relative isolate flex flex-col ${fontClasses(theme.fonts.heading, theme.fonts.body)} ${props.fullHeight ? "min-h-screen" : ""}`}
      style={themeStyle(theme)}
    >
      <Backdrop background={theme.background} assetUrl={props.assetUrl} />
      <header className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <a href={props.pageHref(doc.pages[0].slug)} onClick={onNavigate && ((e) => { e.preventDefault(); onNavigate(doc.pages[0].slug); })} className="flex items-center gap-2 font-bold no-underline" style={{ fontFamily: "var(--site-font-heading)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- logo du site servi par l'API */}
          {theme.logoAssetId && <img src={props.assetUrl(theme.logoAssetId)} alt="" className="h-9 w-auto" />}
          {props.title}
        </a>
        {!ended && (
          <nav aria-label="Pages du site" className="flex flex-wrap items-center gap-4">
            {menu.map((p) => (
              <a key={p.slug} href={props.pageHref(p.slug)} aria-current={p.slug === page.slug ? "page" : undefined} onClick={onNavigate && ((e) => { e.preventDefault(); onNavigate(p.slug); })} className="no-underline">
                {p.title}
              </a>
            ))}
            <a href={bookingHref(ctx)} aria-label="Retrouver ma réservation" title="Retrouver ma réservation"><UserRound className="size-5" aria-hidden="true" /></a>
          </nav>
        )}
      </header>
      <main className="relative flex-1">
        {ended ? (
          <Plain>
            <div className="py-10 text-center">
              <Heading as="h1">Événement terminé</Heading>
              <p className="mt-2">« {props.title} » est terminé. Merci à toutes et à tous pour votre participation.</p>
            </div>
          </Plain>
        ) : (
          <>
            {theme.headerAssetId && page === doc.pages[0] && (
              // eslint-disable-next-line @next/next/no-img-element -- en-tête du site servi par l'API
              <img src={props.assetUrl(theme.headerAssetId)} alt="" className="max-h-80 w-full object-cover" />
            )}
            {page.kind === "content" && page.sections.map((section, i) => <Section key={i} section={section} ctx={ctx} />)}
            {page.kind === "tickets" && <TicketsPage ctx={ctx} />}
            {page.kind === "menus" && <MenusPage ctx={ctx} />}
            {page.kind === "practical" && <PracticalPage ctx={ctx} />}
          </>
        )}
      </main>
      <footer className="relative px-4 py-4 text-center text-xs opacity-70">Propulsé par Koinonia</footer>
    </div>
  );
}
