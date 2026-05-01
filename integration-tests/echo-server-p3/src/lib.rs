// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.
//
// Replicates the wasmtime test echo server
// (D:\wasmtime\crates\wasi-http\tests\all\http_server.rs) as a wasi:http
// handler so it can be hosted by `jsco serve` in an external process and
// reused by jsco's HTTP outbound integration tests.
//
// Behaviour (per wasmtime's `service_fn(test)`):
//   - status: 200
//   - header `x-wasmtime-test-method` = stringified request method
//   - header `x-wasmtime-test-uri`    = path-with-query (or "" when None)
//   - header `content-length`         = pass-through if present on request
//   - body: echo of request body bytes (trailers also forwarded)
//
// See d:\jsco\http-echo-server.md for the wire contract.

wit_bindgen::generate!({
    path: ["wit"],
    world: "wasmtime:wasi-http/bindings",
    pub_export_macro: true,
    generate_all,
});

use exports::wasi::http::handler::Guest as Handler;
use wasi::http::types::{ErrorCode, Fields, Method, Request, Response, Scheme};

struct Component;

export!(Component);

fn method_to_str(m: &Method) -> String {
    match m {
        Method::Get => "GET".into(),
        Method::Head => "HEAD".into(),
        Method::Post => "POST".into(),
        Method::Put => "PUT".into(),
        Method::Delete => "DELETE".into(),
        Method::Connect => "CONNECT".into(),
        Method::Options => "OPTIONS".into(),
        Method::Trace => "TRACE".into(),
        Method::Patch => "PATCH".into(),
        Method::Other(s) => s.clone(),
    }
}

fn _scheme_unused(s: Option<Scheme>) {
    // Reference scheme so wit-bindgen keeps the type imported even if unused.
    let _ = s;
}

impl Handler for Component {
    async fn handle(request: Request) -> Result<Response, ErrorCode> {
        // Capture the bits we want to mirror back in headers BEFORE consuming
        // the body (which moves the request).
        let method_str = method_to_str(&request.get_method());
        let uri = request.get_path_with_query().unwrap_or_default();

        // Pass through Content-Length if the request had one.
        let req_headers = request.get_headers();
        let content_length: Option<Vec<u8>> = req_headers
            .get(&"content-length".to_string())
            .into_iter()
            .next();

        // Construct the response headers list.
        let mut entries: Vec<(String, Vec<u8>)> = vec![
            ("x-wasmtime-test-method".into(), method_str.into_bytes()),
            ("x-wasmtime-test-uri".into(), uri.into_bytes()),
        ];
        if let Some(cl) = content_length {
            entries.push(("content-length".into(), cl));
        }
        let resp_headers = Fields::from_list(&entries)
            .expect("constructing response headers must succeed");

        // Move the request into a (body-stream, trailers-future) pair and
        // forward both directly to the response. This is the
        // `x-host-to-host: true` fast path from p3_http_echo: zero copies.
        let (_body_done_tx, body_done_rx) = wit_future::new(|| Ok(()));
        let (body_rx, trailers_rx) = Request::consume_body(request, body_done_rx);

        let (response, _transmit) =
            Response::new(resp_headers, Some(body_rx), trailers_rx);
        // Status defaults to 200; explicit set is harmless and self-documenting.
        response
            .set_status_code(200)
            .map_err(|()| ErrorCode::InternalError(Some("set_status_code 200".into())))?;
        Ok(response)
    }
}

// `bin` placeholder; not invoked in component world.
fn main() {}
