"use client";

import { useEffect, useState } from "react";

export interface KeyboardBox {
  /** Hauteur réellement visible (au-dessus du clavier), en pixels. */
  height: number;
  /** Décalage de la zone visible quand le navigateur a fait défiler la page sous le clavier. */
  top: number;
}

/**
 * Zone visible quand un clavier virtuel recouvre l'écran, ou `null` sans clavier. Safari sur
 * iPhone ne réduit pas `100dvh` à l'ouverture du clavier : il fait défiler la page, et un panneau
 * plein écran perd alors son en-tête. La `visualViewport` donne la vraie zone visible.
 */
export function keyboardBox(viewport: { height: number; offsetTop: number }, innerHeight: number): KeyboardBox | null {
  const covered = innerHeight - viewport.height > 1 || viewport.offsetTop > 0;
  return covered ? { height: Math.round(viewport.height), top: Math.round(viewport.offsetTop) } : null;
}

/** Suit la zone visible (clavier ouvert, fermé, défilement du navigateur). */
export function useKeyboardBox(): KeyboardBox | null {
  const [box, setBox] = useState<KeyboardBox | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setBox(keyboardBox(vv, window.innerHeight));
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return box;
}
