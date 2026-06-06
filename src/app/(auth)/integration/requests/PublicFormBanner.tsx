"use client";

import { useState } from "react";

export default function PublicFormBanner({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/rejoindre/${slug}`;

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex items-center gap-3 bg-icc-violet/5 border border-icc-violet/20 rounded-xl px-4 py-3">
      <svg className="w-4 h-4 text-icc-violet shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-icc-violet mb-0.5">Lien public — formulaire de rejoindre une famille</p>
        <p className="text-xs text-gray-500 truncate">{url}</p>
      </div>
      <button
        onClick={copy}
        className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-icc-violet/30 text-icc-violet hover:bg-icc-violet/10 transition-colors font-medium"
      >
        {copied ? (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Copié !
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copier
          </>
        )}
      </button>
    </div>
  );
}
