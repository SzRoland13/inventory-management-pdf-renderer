export enum ErrorCode {
  Unauthorized = 'UNAUTHORIZED',
  UnsupportedMediaType = 'UNSUPPORTED_MEDIA_TYPE',
  InvalidRequest = 'INVALID_REQUEST',
  InvalidOptions = 'INVALID_OPTIONS',
  CapacityExceeded = 'CAPACITY_EXCEEDED',
  RendererUnavailable = 'RENDERER_UNAVAILABLE',
  PayloadTooLarge = 'PAYLOAD_TOO_LARGE',
  InvalidJson = 'INVALID_JSON',
  InternalError = 'INTERNAL_ERROR',
  NotFound = 'NOT_FOUND',
  RenderTimeout = 'RENDER_TIMEOUT',
  RenderFailed = 'RENDER_FAILED',
}

export enum HttpStatus {
  Ok = 200,
  BadRequest = 400,
  Unauthorized = 401,
  NotFound = 404,
  PayloadTooLarge = 413,
  UnsupportedMediaType = 415,
  InternalServerError = 500,
  ServiceUnavailable = 503,
  GatewayTimeout = 504,
}

export enum ApiEndpoint {
  Render = '/api/v1/render',
  HealthLive = '/health/live',
  HealthReady = '/health/ready',
}

export enum HealthStatus {
  Ok = 'ok',
  Ready = 'ready',
  NotReady = 'not_ready',
}

export const ERROR_MESSAGES = {
  unauthorized: 'error.unauthorized',
  unsupportedMediaType: 'error.unsupportedMediaType',
  invalidRequest: 'error.invalidRequest',
  invalidOptions: 'error.invalidOptions',
  capacityExceeded: 'error.capacityExceeded',
  rendererUnavailable: 'error.rendererUnavailable',
  payloadTooLarge: 'error.payloadTooLarge',
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
