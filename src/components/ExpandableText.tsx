"use client";

import { useState } from "react";

const PREVIEW_LENGTH = 150;

/** Texte long replié sur ses premiers caractères, avec un lien « Voir plus / Voir moins ». */
export default function ExpandableText({ text }: { readonly text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > PREVIEW_LENGTH;
  return (
    <div className="mb-3">
      <p className="text-sm text-ink-muted whitespace-pre-wrap">
        {isLong && !expanded ? `${text.slice(0, PREVIEW_LENGTH).trimEnd()}…` : text}
      </p>
      {isLong && (
        <button onClick={() => setExpanded((v) => !v)} className="mt-1 text-xs text-brand-text hover:underline">
          {expanded ? "Voir moins" : "Voir plus"}
        </button>
      )}
    </div>
  );
}
