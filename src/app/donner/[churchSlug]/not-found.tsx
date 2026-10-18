/** Même message pour une église inconnue, une page jamais configurée ou désactivée (spec 065). */
export default function GivingPageNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <div className="max-w-md rounded-card border border-line bg-surface p-8 text-center">
        <h1 className="font-display text-[22px] font-bold leading-7 text-ink">Cette page n&apos;est pas disponible</h1>
        <p className="mt-2 text-[15px] leading-[22px] text-ink-muted">
          Le lien est peut-être incorrect, ou la page a été désactivée.
        </p>
      </div>
    </div>
  );
}
