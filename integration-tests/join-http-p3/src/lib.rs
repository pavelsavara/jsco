// P8 verification: futures::join!(client.send_a, client.send_b) on a
// single guest task. Re-exports two parallel HTTP GET requests against
// the same authority and returns both status codes.
//
// Hypothesis: independent client.send calls (no shared pipe between the
// arms) do NOT deadlock under JSPI. The wasm-thread-wide suspend at
// waitable-set.wait wakes on either subtask, schedules the other, and
// both responses arrive concurrently from the host event loop.

wit_bindgen::generate!({
    inline: "
        package jsco:join-http-p3;

        interface runner {
            /// Issue two GET requests concurrently against `authority`
            /// (\"host:port\") at paths `/a` and `/b`. Returns both status
            /// codes in a 2-element list, or an error string on failure.
            join-two-sends: async func(authority: string) -> result<list<u16>, string>;
        }

        world join-http-p3 {
            import wasi:http/types@0.3.0-rc-2026-03-15;
            import wasi:http/client@0.3.0-rc-2026-03-15;
            export runner;
        }
    ",
    path: ["wit"],
    world: "jsco:join-http-p3/join-http-p3",
    pub_export_macro: true,
    generate_all,
});

use anyhow::{anyhow, Result};
use futures::join;
use wasi::http::{client, types};

struct Component;

export!(Component);

async fn send_one(authority: &str, path: &str) -> Result<u16> {
    let headers = types::Headers::from_list(&[]).map_err(|e| anyhow!("headers: {e:?}"))?;
    // No body; trailers future resolves to Ok(None) via the default closure
    // when we drop the writer end without writing.
    let (trailers_tx, trailers_rx) = wit_future::new(|| Ok(None));
    let (request, _transmit) = types::Request::new(headers, None, trailers_rx, None);

    request
        .set_method(&types::Method::Get)
        .map_err(|()| anyhow!("set_method"))?;
    request
        .set_scheme(Some(&types::Scheme::Http))
        .map_err(|()| anyhow!("set_scheme"))?;
    request
        .set_authority(Some(authority))
        .map_err(|()| anyhow!("set_authority"))?;
    request
        .set_path_with_query(Some(path))
        .map_err(|()| anyhow!("set_path_with_query"))?;

    // Drop the trailers writer so the future resolves and the host can
    // close the request body cleanly.
    drop(trailers_tx);

    let response = client::send(request)
        .await
        .map_err(|e| anyhow!("send: {e:?}"))?;
    let status = response.get_status_code();
    // Drain the response body + trailers so the host releases the
    // underlying connection. We don't care about the bytes.
    let (_dummy_tx, dummy_rx) = wit_future::new(|| Ok(()));
    let (body_rx, trailers_rx2) = types::Response::consume_body(response, dummy_rx);
    let _body = body_rx.collect().await;
    let _trailers = trailers_rx2.await;
    Ok(status)
}

impl exports::jsco::join_http_p3::runner::Guest for Component {
    async fn join_two_sends(authority: String) -> Result<Vec<u16>, String> {
        let (a, b) = join!(send_one(&authority, "/a"), send_one(&authority, "/b"));
        let a = a.map_err(|e| format!("send /a failed: {e}"))?;
        let b = b.map_err(|e| format!("send /b failed: {e}"))?;
        Ok(vec![a, b])
    }
}

fn main() {}
