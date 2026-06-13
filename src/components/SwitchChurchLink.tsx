"use client";

interface Props {
  churchId: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}

export default function SwitchChurchLink({ churchId, href, className, children }: Props) {
  async function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    await fetch("/api/current-church", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ churchId }),
    });
    window.location.href = href;
  }

  return (
    <a href={href} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
