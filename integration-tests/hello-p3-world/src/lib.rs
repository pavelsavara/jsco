wit_bindgen::generate!({
    inline: "
        package jsco:hello-p3-world;

        world hello-p3-world {
            import wasi:cli/stdout@0.3.0-rc-2026-03-15;
            import wasi:cli/types@0.3.0-rc-2026-03-15;

            export wasi:cli/run@0.3.0-rc-2026-03-15;
        }
    ",
    path: ["../../wit/wasip3/cli"],
    world: "jsco:hello-p3-world/hello-p3-world",
    pub_export_macro: true,
    generate_all,
});

struct Component;

export!(Component);

impl exports::wasi::cli::run::Guest for Component {
    async fn run() -> Result<(), ()> {
        let (mut tx, rx) = wit_stream::new();
        futures::join!(
            async {
                wasi::cli::stdout::write_via_stream(rx).await.unwrap();
            },
            async {
                tx.write(b"hello from jsco\n".to_vec()).await;
                drop(tx);
            },
        );
        Ok(())
    }
}

fn main() {}
