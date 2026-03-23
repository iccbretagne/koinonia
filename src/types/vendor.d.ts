// Ambient declarations for packages with empty type definition files.

declare module "jspdf" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const jsPDF: any;
}

declare module "html2canvas-pro" {
  function html2canvas(
    element: HTMLElement,
    options?: { scale?: number; useCORS?: boolean; [key: string]: unknown }
  ): Promise<HTMLCanvasElement>;
  export default html2canvas;
}
