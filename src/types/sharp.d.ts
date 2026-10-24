declare module "sharp" {
  interface Metadata {
    width?: number;
    height?: number;
    format?: string;
    exif?: Buffer;
  }
  interface Sharp {
    rotate(): Sharp;
    resize(width?: number | null, height?: number | null, options?: Record<string, unknown>): Sharp;
    resize(options: Record<string, unknown>): Sharp;
    jpeg(options?: Record<string, unknown>): Sharp;
    webp(options?: Record<string, unknown>): Sharp;
    png(options?: Record<string, unknown>): Sharp;
    withMetadata(options?: Record<string, unknown>): Sharp;
    toBuffer(): Promise<Buffer>;
    metadata(): Promise<Metadata>;
  }
  interface CreateInput {
    create: { width: number; height: number; channels: 3 | 4; background: Record<string, number> };
  }
  function sharp(input: Buffer | CreateInput, options?: { limitInputPixels?: number | boolean; failOn?: string }): Sharp;
  export = sharp;
}
