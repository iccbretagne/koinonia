"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GivingPageContent } from "@/modules/giving/schemas";
import GivingSlideStage from "./slide/GivingSlideStage";
import { qrPath } from "@/lib/qr";
import { toSlideProps } from "./slide/slide-props";

/** Valeur qui ne suit la source qu'après `delay` ms sans changement. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Aperçu de la slide dans le paramétrage (spec 067) : la vraie scène, alimentée par le brouillon
 * via la même traduction que la slide projetée. Ajusté 150 ms après la dernière frappe.
 */
export default function SlidePreview({
  content,
  churchName,
  publicUrl,
  logoSrc,
}: {
  readonly content: GivingPageContent;
  readonly churchName: string;
  readonly publicUrl: string;
  /** Logo du paramétrage : la route publique ne le sert qu'une fois la page publiée. */
  readonly logoSrc: string | null;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(content, 150);
  const props = useMemo(
    () => toSlideProps(debounced, { churchName, publicUrl, logoSrc }),
    [debounced, churchName, publicUrl, logoSrc]
  );
  const qr = useMemo(() => qrPath(props.target), [props.target]);
  return <GivingSlideStage {...props} qr={qr} stageRef={stageRef} slideRef={slideRef} />;
}
