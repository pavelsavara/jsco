#[allow(warnings)]
mod bindings;

use bindings::exports::wasi::cli::environment::Guest as EnvironmentGuest;
use bindings::exports::wasi::cli::exit::Guest as ExitGuest;
use bindings::exports::wasi::cli::stdin::Guest as StdinGuest;
use bindings::exports::wasi::cli::stdout::Guest as StdoutGuest;
use bindings::exports::wasi::cli::stderr::Guest as StderrGuest;
use bindings::exports::wasi::random::random::Guest as RandomGuest;
use bindings::exports::wasi::clocks::monotonic_clock::Guest as MonotonicClockGuest;
use bindings::exports::wasi::clocks::wall_clock::Guest as WallClockGuest;

struct Component;

bindings::export!(Component with_types_in bindings);

// A simple deterministic counter for fake time
static mut MONOTONIC_COUNTER: u64 = 1_000_000;

impl EnvironmentGuest for Component {
    fn get_environment() -> Vec<(String, String)> {
        vec![
            ("JSCO_TEST_MODE".to_string(), "fake".to_string()),
            ("TEST_SPECIAL".to_string(), "hello=world 🌍".to_string()),
            ("HOME".to_string(), "/fake/home".to_string()),
        ]
    }

    fn get_arguments() -> Vec<String> {
        vec!["fake-program".to_string(), "--fake-arg".to_string()]
    }

    fn initial_cwd() -> Option<String> {
        Some("/fake/cwd".to_string())
    }
}

impl ExitGuest for Component {
    fn exit(_status: Result<(), ()>) {
        // Fake: do nothing, don't actually exit
    }
}

impl StdinGuest for Component {
    fn get_stdin() -> bindings::exports::wasi::cli::stdin::InputStream {
        // Return a stream — this needs the io/streams resource
        // For simplicity, we'll need to handle this via the generated bindings
        todo!("stdin not yet faked")
    }
}

impl StdoutGuest for Component {
    fn get_stdout() -> bindings::exports::wasi::cli::stdout::OutputStream {
        todo!("stdout not yet faked")
    }
}

impl StderrGuest for Component {
    fn get_stderr() -> bindings::exports::wasi::cli::stderr::OutputStream {
        todo!("stderr not yet faked")
    }
}

impl RandomGuest for Component {
    fn get_random_bytes(len: u64) -> Vec<u8> {
        // Deterministic fake: fill with incrementing bytes
        (0..len).map(|i| (i & 0xFF) as u8).collect()
    }

    fn get_random_u64() -> u64 {
        0xDEAD_BEEF_CAFE_BABE
    }
}

impl MonotonicClockGuest for Component {
    fn now() -> u64 {
        // Return incrementing values so non-decreasing invariant holds
        unsafe {
            MONOTONIC_COUNTER += 1000;
            MONOTONIC_COUNTER
        }
    }

    fn resolution() -> u64 {
        1_000 // 1 microsecond
    }

    fn subscribe_instant(_when: u64) -> bindings::exports::wasi::clocks::monotonic_clock::Pollable {
        todo!("subscribe-instant not yet faked")
    }

    fn subscribe_duration(_when: u64) -> bindings::exports::wasi::clocks::monotonic_clock::Pollable {
        todo!("subscribe-duration not yet faked")
    }
}

impl WallClockGuest for Component {
    fn now() -> bindings::exports::wasi::clocks::wall_clock::Datetime {
        bindings::exports::wasi::clocks::wall_clock::Datetime {
            seconds: 1_700_000_000, // ~2023-11-14
            nanoseconds: 123_456_789,
        }
    }

    fn resolution() -> bindings::exports::wasi::clocks::wall_clock::Datetime {
        bindings::exports::wasi::clocks::wall_clock::Datetime {
            seconds: 0,
            nanoseconds: 1_000_000, // 1ms
        }
    }
}
