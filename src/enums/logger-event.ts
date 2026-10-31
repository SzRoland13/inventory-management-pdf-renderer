export enum LoggerEvent {
  ServerStarted = 'server_started',
  ServerShuttingDown = 'server_shutting_down',
  StartupFailed = 'startup_failed',
  HttpShutdownFailed = 'http_shutdown_failed',
  BrowserShutdownFailed = 'browser_shutdown_failed',
  BrowserLaunchFailed = 'browser_launch_failed',
  RequestFailed = 'request_failed',
  RenderCompleted = 'render_completed',
  RenderFailed = 'render_failed',
  ContextCloseFailed = 'context_close_failed',
}
