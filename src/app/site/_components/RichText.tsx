import { Fragment, type ReactNode } from "react";
import { linkSchema, type RichInline, type RichNode } from "@/modules/ticketing/schemas";

/**
 * Rendu du texte riche (arbre validé) : des éléments React, jamais de HTML brut. Les liens sont
 * revérifiés ici — https, mailto ou page du site — même si l'arbre a déjà été validé à l'écriture.
 */
function Inline({ part, pageHref }: { readonly part: RichInline; readonly pageHref: (slug: string) => string }) {
  let node: ReactNode = part.text;
  if (part.bold) node = <strong>{node}</strong>;
  if (part.italic) node = <em>{node}</em>;
  const href = part.href && linkSchema.safeParse(part.href).success ? part.href : null;
  if (!href) return <>{node}</>;
  if (href.startsWith("page:")) return <a href={pageHref(href.slice(5))} className="underline">{node}</a>;
  return (
    <a href={href} rel="noopener noreferrer" target={href.startsWith("https:") ? "_blank" : undefined} className="underline">
      {node}
    </a>
  );
}

function Inlines({ parts, pageHref }: { readonly parts: RichInline[]; readonly pageHref: (slug: string) => string }) {
  return (
    <>
      {parts.map((part, i) => (
        <Inline key={i} part={part} pageHref={pageHref} />
      ))}
    </>
  );
}

export default function RichText({ nodes, pageHref }: { readonly nodes: RichNode[]; readonly pageHref: (slug: string) => string }) {
  return (
    <div className="space-y-4 leading-7">
      {nodes.map((node, i) => {
        switch (node.type) {
          case "h2":
            return <h2 key={i} className="text-2xl font-bold" style={{ fontFamily: "var(--site-font-heading)" }}><Inlines parts={node.children} pageHref={pageHref} /></h2>;
          case "h3":
            return <h3 key={i} className="text-xl font-semibold" style={{ fontFamily: "var(--site-font-heading)" }}><Inlines parts={node.children} pageHref={pageHref} /></h3>;
          case "p":
            return <p key={i}><Inlines parts={node.children} pageHref={pageHref} /></p>;
          case "ul":
          case "ol": {
            const List = node.type;
            return (
              <List key={i} className={`${node.type === "ul" ? "list-disc" : "list-decimal"} space-y-1 pl-6`}>
                {node.items.map((item, j) => (
                  <Fragment key={j}><li><Inlines parts={item} pageHref={pageHref} /></li></Fragment>
                ))}
              </List>
            );
          }
        }
      })}
    </div>
  );
}
