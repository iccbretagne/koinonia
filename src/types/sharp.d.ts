declare module "sharp" {
  interface Metadata {
    width?: number;
    height?: number;
    format?: string;
    exif?: Buffer;
    hasAlpha?: boolean;
  }
  interface OutputInfo {
    width: number;
    height: number;
    channels: number;
  }
  interface Color {
    r: number;
    g: number;
    b: number;
    alpha?: number;
  }
  interface OverlayOptions {
    input: Buffer | string;
    left?: number;
    top?: number;
    blend?: string;
  }
  interface Sharp {
    rotate(): Sharp;
    resize(width?: number | null, height?: number | null, options?: Record<string, unknown>): Sharp;
    resize(options: Record<string, unknown>): Sharp;
    jpeg(options?: Record<string, unknown>): Sharp;
    webp(options?: Record<string, unknown>): Sharp;
    png(options?: Record<string, unknown>): Sharp;
    gif(options?: Record<string, unknown>): Sharp;
    raw(): Sharp;
    ensureAlpha(): Sharp;
    removeAlpha(): Sharp;
    extract(region: { left: number; top: number; width: number; height: number }): Sharp;
    composite(images: OverlayOptions[]): Sharp;
    withMetadata(options?: Record<string, unknown>): Sharp;
    toBuffer(): Promise<Buffer>;
    toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: OutputInfo }>;
    toFile(path: string): Promise<OutputInfo>;
    metadata(): Promise<Metadata>;
  }
  interface CreateInput {
    create: { width: number; height: number; channels: 3 | 4; background: Color | string };
  }
  interface SharpOptions {
    limitInputPixels?: number | boolean;
    failOn?: string;
    raw?: { width: number; height: number; channels: 1 | 2 | 3 | 4 };
  }
  function sharp(input: Buffer | string | CreateInput, options?: SharpOptions): Sharp;
  export = sharp;
}
