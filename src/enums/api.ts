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
