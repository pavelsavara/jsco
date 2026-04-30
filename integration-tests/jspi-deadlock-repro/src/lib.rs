//! Minimal independent reproducer for the WASIp3 / JSPI canon-lower
//! deadlock with `futures::join!` over an in-task stream pipe.
//!
//! Pattern:
//!     let (mut tx, rx) = wit_stream::new();
//!     let (got, _)  = futures::join!(
//!         async { host::slow_collect(rx) },             // SYNC import
//!         async { tx.write(..).await; drop(tx); },
//!     );
//!
//! `host::slow-collect` returns plain `list<u8>` (NOT `future<list<u8>>`).
//! The plain return forces the canonical ABI to use sync-form canon.lower,
//! i.e. the host's `Promise<Uint8Array>` is wrapped in
//! `WebAssembly.Suspending`. The calling wasm task suspends on the FIRST
//! poll of the first join arm, before the second arm has had a chance to
//! push bytes into `tx`. The stream stays empty, the host promise never
//! resolves, the wasm task never resumes — deadlock.
//!
//! Contrast: changing the signature to
//!     slow-collect: func(data: stream<u8>) -> future<list<u8>>;
//! yields async-form canon.lower (subtask handle returned immediately,
//! awaited via future.read), and the join completes cleanly.

wit_bindgen::generate!({
    inline: "
        package example:jspi-repro;

        interface host {
            /// Sync host import: collects a stream into a list.
            /// The plain (non-future) return type forces canon.lower
            /// to wrap the host Promise in WebAssembly.Suspending.
            slow-collect: func(data: stream<u8>) -> list<u8>;
        }

        interface guest {
            /// Returns true iff the join completed and the collected
            /// bytes match the payload pushed by the writer arm.
            run-repro: async func() -> bool;
        }

        world repro {
            import host;
            export guest;
        }
    ",
    world: "example:jspi-repro/repro",
    pub_export_macro: true,
    generate_all,
});

struct Component;

export!(Component);

const PAYLOAD: &[u8] = b"hello";

impl exports::example::jspi_repro::guest::Guest for Component {
    async fn run_repro() -> bool {
        let (mut tx, rx) = wit_stream::new();
        let (collected, ()) = futures::join!(
            async { example::jspi_repro::host::slow_collect(rx) },
            async {
                tx.write(PAYLOAD.to_vec()).await;
                drop(tx);
            },
        );
        collected == PAYLOAD
    }
}

fn main() {}
