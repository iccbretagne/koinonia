import { FormPageSkeleton } from "@/app/(auth)/loading-skeletons";

/** Pages publiques : même squelette de formulaire, sur le fond de page et dans la largeur du contenu. */
export default function Loading() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-xl bg-bg px-4 py-8">
      <FormPageSkeleton fields={4} />
    </div>
  );
}
