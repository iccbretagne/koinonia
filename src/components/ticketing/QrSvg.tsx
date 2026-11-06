/**
 * QR code en SVG (billets, code de réservation, badges, étiquettes — spec 074). Le tracé vient
 * de `qrPath` (`@/lib/qr`), calculé côté serveur. Toujours noir sur blanc, quel que soit le
 * thème : un QR inversé se lit mal.
 */
export default function QrSvg({
  qr,
  label,
  className = "size-56",
}: {
  readonly qr: { size: number; path: string };
  readonly label: string;
  readonly className?: string;
}) {
  const box = qr.size + 4;
  return (
    <svg viewBox={`-2 -2 ${box} ${box}`} role="img" aria-label={label} className={className} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={box} height={box} fill="white" />
      <path d={qr.path} fill="black" />
    </svg>
  );
}
