/**
 * Lecture de QR depuis la caméra arrière (spec 074) : `BarcodeDetector` quand le navigateur l'a,
 * sinon `jsqr` (Safari iOS), chargé à la demande. Renvoie une fonction d'arrêt.
 */

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => Detector;
  }
}

export async function startScanner(video: HTMLVideoElement, onCode: (text: string) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  await video.play();

  let detector: Detector | null = null;
  if (window.BarcodeDetector) {
    try {
      detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    } catch {
      detector = null;
    }
  }
  const jsQR = detector ? null : (await import("jsqr")).default;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  let stopped = false;
  let last = "";
  let lastAt = 0;
  const emit = (text: string) => {
    const now = Date.now();
    // Le même code tenu devant la caméra n'est relu qu'après 2,5 s.
    if (text === last && now - lastAt < 2500) return;
    last = text;
    lastAt = now;
    onCode(text);
  };

  async function tick() {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        if (detector) {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) emit(codes[0].rawValue);
        } else if (jsQR && ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
          if (code?.data) emit(code.data);
        }
      }
    } catch {
      // image illisible : on continue
    }
    setTimeout(tick, 200);
  }
  void tick();

  return () => {
    stopped = true;
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };
}
