"use client";

import Input from "@/components/ui/Input";

interface Props {
  readonly email: string;
  readonly onEmailChange: (value: string) => void;
  readonly emailPlaceholder?: string;
  readonly url: string;
  readonly onUrlChange: (value: string) => void;
  readonly urlLabel: string;
  readonly urlPlaceholder?: string;
}

/** Coordonnées de contact d'une annonce emploi : email et lien. */
export default function JobContactFields({
  email,
  onEmailChange,
  emailPlaceholder = "votre@email.fr",
  url,
  onUrlChange,
  urlLabel,
  urlPlaceholder = "https://...",
}: Props) {
  return (
    <>
      <Input
        label="Email de contact"
        type="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        placeholder={emailPlaceholder}
      />

      <Input
        label={urlLabel}
        type="url"
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder={urlPlaceholder}
      />
    </>
  );
}
