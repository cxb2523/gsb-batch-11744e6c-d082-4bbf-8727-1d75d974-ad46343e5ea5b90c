export interface Options {
  strict?: boolean;
  retainExif?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  minWidth?: number;
  minHeight?: number;
  width?: number;
  height?: number;
  resize?: 'contain' | 'cover' | 'none';
  quality?: number;
  mimeType?: string;
  convertTypes?: string | string[];
  convertSize?: number;
  beforeDraw?(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void;
  drew?(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void;
  success?(file: File | Blob): void;
  error?(err: Error): void;
}

export interface AuditFileInfo {
  type?: string;
  size?: number;
  name?: string;
  lastModified?: number;
}

export interface AuditResultInfo {
  type?: string;
  size?: number;
}

export interface AuditOptions {
  strict?: boolean;
  retainExif?: boolean;
  mimeType?: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  convertTypes?: string | string[];
  convertSize?: number;
}

export interface AuditSnapshot {
  file?: AuditFileInfo;
  result?: AuditResultInfo | null;
  options?: AuditOptions;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface AuditCheck {
  name: string;
  passed: boolean;
  reason: string | null;
}

export interface AuditReport {
  fallback: {
    occurs: boolean;
    reason: 'strict' | 'canvas-no-output' | 'none';
  };
  output: {
    mimeType: string;
    name: string;
    extension: string;
    typeChanged: boolean;
  };
  exif: {
    action: 'retain' | 'strip' | 'none';
    reason: string;
  };
  checks: AuditCheck[];
  degraded: boolean;
  issues: Array<{
    field: string;
    reason: string;
  }>;
}

export function auditOutput(snapshot?: AuditSnapshot): AuditReport;

declare class Compressor {
  constructor(file: File | Blob, options?: Options);
  abort(): void;
  static setDefaults(options: Options): void;
}

// Keeps `Compressor.Options` working alongside the named `Options` export
declare namespace Compressor {
  export { Options };
}

export default Compressor;
