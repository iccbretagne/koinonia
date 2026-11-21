import { Cinzel, Cormorant_Garamond, Inter, Lora, Montserrat, Playfair_Display, Source_Sans_3 } from "next/font/google";
import type { SiteFont } from "@/modules/ticketing/schemas";

/**
 * Polices proposées aux sites d'événement (liste fermée, spec 084). `next/font` exige une
 * déclaration statique : les sept sont déclarées ici une fois, et seules les deux polices choisies
 * par le site sont appliquées (classe `variable`) au conteneur racine.
 */
// `next/font` exige des options littérales (ni variable, ni décomposition).
const montserrat = Montserrat({ subsets: ["latin"], display: "swap", variable: "--font-site-montserrat" });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", variable: "--font-site-playfair" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], display: "swap", variable: "--font-site-cormorant", weight: ["400", "600", "700"] });
const lora = Lora({ subsets: ["latin"], display: "swap", variable: "--font-site-lora" });
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-site-inter" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], display: "swap", variable: "--font-site-source-sans" });
const cinzel = Cinzel({ subsets: ["latin"], display: "swap", variable: "--font-site-cinzel" });

const FONTS: Record<SiteFont, { variable: string; className: string; stack: string }> = {
  montserrat: { variable: "--font-site-montserrat", className: montserrat.variable, stack: "sans-serif" },
  playfair: { variable: "--font-site-playfair", className: playfair.variable, stack: "serif" },
  cormorant: { variable: "--font-site-cormorant", className: cormorant.variable, stack: "serif" },
  lora: { variable: "--font-site-lora", className: lora.variable, stack: "serif" },
  inter: { variable: "--font-site-inter", className: inter.variable, stack: "sans-serif" },
  sourceSans: { variable: "--font-site-source-sans", className: sourceSans.variable, stack: "sans-serif" },
  cinzel: { variable: "--font-site-cinzel", className: cinzel.variable, stack: "serif" },
};

/** Valeur CSS `font-family` d'une police de la liste. */
export const fontFamily = (font: SiteFont) => `var(${FONTS[font].variable}), ${FONTS[font].stack}`;
/** Classes `next/font` à poser sur le conteneur racine pour les polices choisies. */
export const fontClasses = (...fonts: SiteFont[]) => [...new Set(fonts)].map((f) => FONTS[f].className).join(" ");
