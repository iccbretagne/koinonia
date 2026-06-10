declare module "sharp" {
  interface Metadata {
    width?: number;
    height?: number;
    format?: string;
  }
  interface Sharp {
    rotate(): Sharp;
    resize(width?: number | null, height?: number | null, options?: Record<string, unknown>): Sharp;
    jpeg(options?: Record<string, unknown>): Sharp;
    webp(options?: Record<string, unknown>): Sharp;
    toBuffer(): Promise<Buffer>;
    metadata(): Promise<Metadata>;
  }
  function sharp(input: Buffer): Sharp;
  export = sharp;
}
