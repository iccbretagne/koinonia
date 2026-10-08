"use client";

interface Props {
  readonly onClick: () => void;
  readonly zipping: boolean;
}

/** Bouton « Tout télécharger (.zip) » des liens de partage publics, avec état de préparation. */
export default function DownloadAllButton({ onClick, zipping }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={zipping}
      className="flex items-center gap-1.5 text-sm bg-brand text-on-brand px-4 py-2 rounded-lg hover:bg-brand-hover disabled:opacity-50 transition-colors font-medium"
    >
      {zipping ? (
        <>
          <span className="w-4 h-4 border-2 border-on-brand/30 border-t-on-brand rounded-full animate-spin" />
          <span>Préparation…</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Tout télécharger (.zip)
        </>
      )}
    </button>
  );
}
