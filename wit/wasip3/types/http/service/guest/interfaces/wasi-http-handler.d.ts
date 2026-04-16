/// <reference path="./wasi-http-types.d.ts" />
declare module 'wasi:http/handler@0.3.0-rc-2026-03-15' {
  /**
   * This function may be called with either an incoming request read from the
   * network or a request synthesized or forwarded by another component.
   */
  export function handle(request: Request): Promise<Response>;
  export type Request = import('wasi:http/types@0.3.0-rc-2026-03-15').Request;
  export type Response = import('wasi:http/types@0.3.0-rc-2026-03-15').Response;
  export type ErrorCode = import('wasi:http/types@0.3.0-rc-2026-03-15').ErrorCode;
}
