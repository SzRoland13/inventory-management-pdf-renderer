import { ErrorCode } from '@/enums/error-code';
import { HttpStatus } from '@/enums/api';
export { ErrorCode } from '@/enums/error-code';
export { ApiEndpoint, HealthStatus, HttpStatus } from '@/enums/api';

export const ERROR_MESSAGES = {
  unauthorized: 'error.unauthorized',
  unsupportedMediaType: 'error.unsupportedMediaType',
  invalidRequest: 'error.invalidRequest',
  invalidOptions: 'error.invalidOptions',
  capacityExceeded: 'error.capacityExceeded',
  rendererUnavailable: 'error.rendererUnavailable',
  payloadTooLarge: 'error.payloadTooLarge',
  pdfTooLarge: 'error.pdfTooLarge',
  invalidJson: 'error.invalidJson',
  generic: 'error.generic',
  notFound: 'error.notFound',
  renderTimeout: 'error.renderTimeout',
  renderFailed: 'error.renderFailed',
  configTokenRequired: 'error.config.tokenRequired',
  invalidLogLevel: 'error.config.invalidLogLevel',
  invalidInteger: 'error.config.invalidInteger',
} as const;

export class ServiceError extends Error {
  readonly code: ErrorCode;
  readonly status: HttpStatus;

  constructor(
    code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.InternalServerError,
  ) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
  }
}
