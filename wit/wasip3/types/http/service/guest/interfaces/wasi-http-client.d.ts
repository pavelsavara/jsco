/// <reference path="./wasi-http-types.d.ts" />
declare module 'wasi:http/client@0.3.0-rc-2026-03-15' {
  /**
   * This function may be used to either send an outgoing request over the
   * network or to forward it to another component.
   */
  export function send(request: Request): Promise<Response>;
  export type Request = import('wasi:http/types@0.3.0-rc-2026-03-15').Request;
  export type Response = import('wasi:http/types@0.3.0-rc-2026-03-15').Response;
  export type ErrorCode = import('wasi:http/types@0.3.0-rc-2026-03-15').ErrorCode;
}
