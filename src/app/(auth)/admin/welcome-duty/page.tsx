import { requirePermission } from "@/lib/auth";
import Link from "next/link";
import WelcomeDutyPoolClient from "./WelcomeDutyPoolClient";

export default async function WelcomeDutyPage() {
  await requirePermission("events:manage");

  return (
    <div>
      <div className="mb-2">
        <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600">
          ← Administration
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Service d&apos;accueil — Pool de familles</h1>
      <p className="text-sm text-gray-500 mb-6">
        Gérez les familles qui participent à la rotation du service d&apos;accueil.
        L&apos;affectation aux événements se fait depuis chaque fiche événement.
      </p>
      <WelcomeDutyPoolClient />
    </div>
  );
}
