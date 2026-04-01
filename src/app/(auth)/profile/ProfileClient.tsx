"use client";

import NoAccessClient from "@/app/no-access/NoAccessClient";

type Church = { id: string; name: string };
type Ministry = { id: string; name: string; departments: { id: string; name: string }[] };

export default function ProfileClient({ churches, ministries }: { churches: Church[]; ministries: Ministry[] }) {
  return (
    <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Faire une demande de lien STAR
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Sélectionnez l&apos;église et indiquez votre fiche STAR pour que l&apos;administrateur puisse valider le lien.
      </p>
      <NoAccessClient churches={churches} ministries={ministries} />
    </div>
  );
}
