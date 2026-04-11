#[allow(warnings)]
mod bindings;

use bindings::exports::wasi::cli::environment::Guest as EnvironmentGuest;
use bindings::exports::wasi::cli::exit::Guest as ExitGuest;
use bindings::exports::wasi::cli::run::Guest as RunGuest;
use bindings::exports::wasi::cli::stdin::Guest as StdinGuest;
use bindings::exports::wasi::cli::stdout::Guest as StdoutGuest;
use bindings::exports::wasi::cli::stderr::Guest as StderrGuest;
use bindings::exports::wasi::random::random::Guest as RandomGuest;
use bindings::exports::wasi::clocks::monotonic_clock::Guest as MonotonicClockGuest;
use bindings::exports::wasi::clocks::wall_clock::Guest as WallClockGuest;

use bindings::jsco::test::logger::{self, Level};

struct Component;

bindings::export!(Component with_types_in bindings);

fn log_forward(name: &str) {
    logger::log(Level::Debug, &format!("[forwarder] {name}"));
}

impl RunGuest for Component {
    fn run() -> Result<(), ()> {
        log_forward("run");
        // The forwarder doesn't have its own run logic — 
        // composition wires the consumer's run through
        Ok(())
    }
}

impl EnvironmentGuest for Component {
    fn get_environment() -> Vec<(String, String)> {
        log_forward("get-environment");
        bindings::wasi::cli::environment::get_environment()
    }

    fn get_arguments() -> Vec<String> {
        log_forward("get-arguments");
        bindings::wasi::cli::environment::get_arguments()
    }

    fn initial_cwd() -> Option<String> {
        log_forward("initial-cwd");
        bindings::wasi::cli::environment::initial_cwd()
    }
}

impl ExitGuest for Component {
    fn exit(status: Result<(), ()>) {
        log_forward("exit");
        bindings::wasi::cli::exit::exit(status);
    }
}

impl StdinGuest for Component {
    fn get_stdin() -> bindings::exports::wasi::cli::stdin::InputStream {
        log_forward("get-stdin");
        bindings::wasi::cli::stdin::get_stdin().into()
    }
}

impl StdoutGuest for Component {
    fn get_stdout() -> bindings::exports::wasi::cli::stdout::OutputStream {
        log_forward("get-stdout");
        bindings::wasi::cli::stdout::get_stdout().into()
    }
}

impl StderrGuest for Component {
    fn get_stderr() -> bindings::exports::wasi::cli::stderr::OutputStream {
        log_forward("get-stderr");
        bindings::wasi::cli::stderr::get_stderr().into()
    }
}

impl RandomGuest for Component {
    fn get_random_bytes(len: u64) -> Vec<u8> {
        log_forward("get-random-bytes");
        bindings::wasi::random::random::get_random_bytes(len)
    }

    fn get_random_u64() -> u64 {
        log_forward("get-random-u64");
        bindings::wasi::random::random::get_random_u64()
    }
}

impl MonotonicClockGuest for Component {
    fn now() -> u64 {
        log_forward("monotonic-clock::now");
        bindings::wasi::clocks::monotonic_clock::now()
    }

    fn resolution() -> u64 {
        log_forward("monotonic-clock::resolution");
        bindings::wasi::clocks::monotonic_clock::resolution()
    }

    fn subscribe_instant(when: u64) -> bindings::exports::wasi::clocks::monotonic_clock::Pollable {
        log_forward("monotonic-clock::subscribe-instant");
        bindings::wasi::clocks::monotonic_clock::subscribe_instant(when).into()
    }

    fn subscribe_duration(when: u64) -> bindings::exports::wasi::clocks::monotonic_clock::Pollable {
        log_forward("monotonic-clock::subscribe-duration");
        bindings::wasi::clocks::monotonic_clock::subscribe_duration(when).into()
    }
}

impl WallClockGuest for Component {
    fn now() -> bindings::exports::wasi::clocks::wall_clock::Datetime {
        log_forward("wall-clock::now");
        let dt = bindings::wasi::clocks::wall_clock::now();
        bindings::exports::wasi::clocks::wall_clock::Datetime {
            seconds: dt.seconds,
            nanoseconds: dt.nanoseconds,
        }
    }

    fn resolution() -> bindings::exports::wasi::clocks::wall_clock::Datetime {
        log_forward("wall-clock::resolution");
        let dt = bindings::wasi::clocks::wall_clock::resolution();
        bindings::exports::wasi::clocks::wall_clock::Datetime {
            seconds: dt.seconds,
            nanoseconds: dt.nanoseconds,
        }
    }
}
