import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function NoAccessPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  // Si l'utilisateur a des rôles entre-temps, rediriger vers le dashboard
  if (session.user.isSuperAdmin || session.user.churchRoles.length > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg border-2 border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-icc-violet/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-icc-violet"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Accès en attente
        </h1>

        <p className="text-gray-600 mb-1">
          Connecté en tant que{" "}
          <span className="font-medium text-gray-800">
            {session.user.name || session.user.email}
          </span>
        </p>

        <p className="text-sm text-gray-500 mb-6">
          {session.user.email}
        </p>

        <p className="text-gray-600 mb-8">
          Votre compte n&apos;a pas encore été configuré. Contactez un{" "}
          <strong>administrateur</strong> ou le <strong>secrétariat</strong>{" "}
          pour demander un accès en fonction de votre rôle dans l&apos;église.
        </p>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full px-4 py-2 text-sm font-medium text-white bg-icc-violet rounded-lg hover:bg-icc-violet/90 transition-colors"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}
