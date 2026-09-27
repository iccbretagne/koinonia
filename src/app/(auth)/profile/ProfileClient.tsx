"use client";

import NoAccessClient from "@/app/no-access/NoAccessClient";

type Church = { id: string; name: string };
type Ministry = { id: string; name: string; churchId: string; departments: { id: string; name: string }[] };

export default function ProfileClient({ churches, ministries }: { readonly churches: Church[]; readonly ministries: Ministry[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Demander le lien à une fiche STAR</h2>
        <p className="text-[13px] leading-[18px] text-ink-muted">
          Choisissez l&apos;église et indiquez votre fiche STAR : un administrateur validera le lien.
        </p>
      </div>
      <div className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
        <NoAccessClient churches={churches} ministries={ministries} />
      </div>
    </section>
  );
}
