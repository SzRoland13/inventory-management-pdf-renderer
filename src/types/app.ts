import type { ServiceConfig } from '@/types/service-config';
import type { Logger } from '@/types/logger';
import type { Renderer } from '@/types/renderer';

export interface AppDependencies {
  config: ServiceConfig;
  renderer: Pick<Renderer, 'isReady' | 'render'>;
  logger?: Logger;
}
