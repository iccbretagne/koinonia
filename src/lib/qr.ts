import QRCode from "qrcode";

/**
 * Matrice d'un QR code sous forme de tracé SVG (un carré par module sombre). Les couleurs sont
 * laissées au rendu (`currentColor` sur une surface claire), pour rester sur les tokens.
 */
export function qrPath(text: string): { size: number; path: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  let path = "";
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) path += `M${col} ${row}h1v1h-1z`;
    }
  }
  return { size: modules.size, path };
}
