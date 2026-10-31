import type { Browser } from 'playwright';
import type { Logger } from '@/types/logger';

export interface Renderer {
  start(): Promise<Browser>;
  render(html: string, options?: unknown): Promise<Buffer>;
  close(): Promise<void>;
  isReady(): boolean;
}

export interface RendererOptions {
  timeoutMs?: number;
  logger?: Logger;
  launch?: () => Promise<Browser>;
}
