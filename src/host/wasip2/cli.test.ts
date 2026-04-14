// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createWasiCli } from './cli';
import { WasiExit } from './api';

describe('wasi:cli/environment', () => {
    it('getEnvironment returns empty list when no config', () => {
        const cli = createWasiCli();
        expect(cli.environment.getEnvironment()).toEqual([]);
    });

    it('getEnvironment returns configured pairs', () => {
        const cli = createWasiCli({ env: [['FOO', 'bar'], ['BAZ', 'qux']] });
        expect(cli.environment.getEnvironment()).toEqual([['FOO', 'bar'], ['BAZ', 'qux']]);
    });

    it('getEnvironment returns a copy (mutations do not affect host)', () => {
        const cli = createWasiCli({ env: [['KEY', 'val']] });
        const env = cli.environment.getEnvironment();
        env.push(['HACK', 'injected']);
        expect(cli.environment.getEnvironment()).toEqual([['KEY', 'val']]);
    });

    it('environment with = in value is preserved', () => {
        const cli = createWasiCli({ env: [['KEY', 'a=b=c']] });
        expect(cli.environment.getEnvironment()).toEqual([['KEY', 'a=b=c']]);
    });

    it('environment with empty value works', () => {
        const cli = createWasiCli({ env: [['KEY', '']] });
        expect(cli.environment.getEnvironment()).toEqual([['KEY', '']]);
    });

    it('environment with unicode keys and values', () => {
        const cli = createWasiCli({ env: [['日本語', 'テスト']] });
        expect(cli.environment.getEnvironment()).toEqual([['日本語', 'テスト']]);
    });

    it('getArguments returns empty list when no config', () => {
        const cli = createWasiCli();
        expect(cli.environment.getArguments()).toEqual([]);
    });

    it('getArguments returns configured arguments', () => {
        const cli = createWasiCli({ args: ['prog', '--flag', 'value'] });
        expect(cli.environment.getArguments()).toEqual(['prog', '--flag', 'value']);
    });

    it('getArguments returns a copy', () => {
        const cli = createWasiCli({ args: ['a'] });
        const args = cli.environment.getArguments();
        args.push('injected');
        expect(cli.environment.getArguments()).toEqual(['a']);
    });

    it('arguments with spaces and special characters', () => {
        const cli = createWasiCli({ args: ['hello world', '--path=/tmp/a b', '"'] });
        expect(cli.environment.getArguments()).toEqual(['hello world', '--path=/tmp/a b', '"']);
    });

    it('initialCwd returns undefined when no config', () => {
        const cli = createWasiCli();
        expect(cli.environment.initialCwd()).toBeUndefined();
    });

    it('initialCwd returns configured cwd', () => {
        const cli = createWasiCli({ cwd: '/home/user' });
        expect(cli.environment.initialCwd()).toBe('/home/user');
    });
});

describe('wasi:cli/exit', () => {
    it('exit with ok throws WasiExit with code 0', () => {
        const cli = createWasiCli();
        expect(() => cli.exit.exit({ tag: 'ok' })).toThrow(WasiExit);
        try {
            cli.exit.exit({ tag: 'ok' });
        } catch (e) {
            expect(e).toBeInstanceOf(WasiExit);
            expect((e as WasiExit).status).toBe(0);
        }
    });

    it('exit with err throws WasiExit with code 1', () => {
        const cli = createWasiCli();
        try {
            cli.exit.exit({ tag: 'err' });
        } catch (e) {
            expect(e).toBeInstanceOf(WasiExit);
            expect((e as WasiExit).status).toBe(1);
        }
    });

    it('WasiExit is distinguishable from regular errors', () => {
        const cli = createWasiCli();
        try {
            cli.exit.exit({ tag: 'ok' });
        } catch (e) {
            expect(e).toBeInstanceOf(WasiExit);
            expect(e).toBeInstanceOf(Error);
            expect(e).not.toBeInstanceOf(TypeError);
        }
    });

    it('WasiExit has a descriptive message', () => {
        const cli = createWasiCli();
        try {
            cli.exit.exit({ tag: 'err' });
        } catch (e) {
            expect((e as WasiExit).message).toContain('WASI exit');
            expect((e as WasiExit).message).toContain('1');
        }
    });
});

describe('wasi:cli/stdin', () => {
    it('getStdin returns an input stream', () => {
        const cli = createWasiCli();
        const stream = cli.stdin.getStdin();
        expect(stream).toBeDefined();
        expect(typeof stream.read).toBe('function');
    });

    it('reading from stdin with no config returns closed immediately', () => {
        const cli = createWasiCli();
        const stream = cli.stdin.getStdin();
        const result = stream.read(1n);
        expect(result.tag).toBe('err');
        if (result.tag === 'err') {
            expect(result.val.tag).toBe('closed');
        }
    });

    it('reading from stdin with configured content returns that content', () => {
        const data = new TextEncoder().encode('hello stdin');
        const cli = createWasiCli({ stdin: data });
        const stream = cli.stdin.getStdin();
        const result = stream.read(100n);
        expect(result.tag).toBe('ok');
        if (result.tag === 'ok') {
            expect(new TextDecoder().decode(result.val)).toBe('hello stdin');
        }
    });

    it('stdin with binary data returns raw bytes', () => {
        const binary = new Uint8Array([0xFF, 0x00, 0x80, 0xFE]);
        const cli = createWasiCli({ stdin: binary });
        const stream = cli.stdin.getStdin();
        const result = stream.read(4n);
        expect(result.tag).toBe('ok');
        if (result.tag === 'ok') {
            expect(result.val).toEqual(binary);
        }
    });

    it('stdin stream becomes closed after all data is read', () => {
        const data = new Uint8Array([1, 2, 3]);
        const cli = createWasiCli({ stdin: data });
        const stream = cli.stdin.getStdin();
        stream.read(3n); // consume all
        const result = stream.read(1n);
        expect(result.tag).toBe('err');
        if (result.tag === 'err') {
            expect(result.val.tag).toBe('closed');
        }
    });

    it('multiple reads from stdin return sequential chunks', () => {
        const data = new Uint8Array([1, 2, 3, 4, 5, 6]);
        const cli = createWasiCli({ stdin: data });
        const stream = cli.stdin.getStdin();
        const r1 = stream.read(2n);
        const r2 = stream.read(2n);
        const r3 = stream.read(2n);
        expect(r1.tag === 'ok' ? r1.val : null).toEqual(new Uint8Array([1, 2]));
        expect(r2.tag === 'ok' ? r2.val : null).toEqual(new Uint8Array([3, 4]));
        expect(r3.tag === 'ok' ? r3.val : null).toEqual(new Uint8Array([5, 6]));
    });

    it('stdin subscribe returns a pollable', () => {
        const cli = createWasiCli({ stdin: new Uint8Array([1]) });
        const stream = cli.stdin.getStdin();
        const pollable = stream.subscribe();
        expect(pollable.ready()).toBe(true);
    });
});

describe('wasi:cli/stdout', () => {
    it('getStdout returns an output stream', () => {
        const cli = createWasiCli();
        const stream = cli.stdout.getStdout();
        expect(stream).toBeDefined();
        expect(typeof stream.write).toBe('function');
    });

    it('writing to stdout with capture callback delivers text', () => {
        const captured: Uint8Array[] = [];
        const cli = createWasiCli({ stdout: (bytes) => captured.push(bytes.slice()) });
        const stream = cli.stdout.getStdout();
        const text = new TextEncoder().encode('hello stdout');
        stream.write(text);
        stream.flush();
        expect(captured.length).toBe(1);
        expect(new TextDecoder().decode(captured[0])).toBe('hello stdout');
    });

    it('multiple writes accumulate until flush', () => {
        const captured: Uint8Array[] = [];
        const cli = createWasiCli({ stdout: (bytes) => captured.push(bytes.slice()) });
        const stream = cli.stdout.getStdout();
        stream.write(new TextEncoder().encode('hello '));
        stream.write(new TextEncoder().encode('world'));
        stream.flush();
        expect(captured.length).toBe(1);
        expect(new TextDecoder().decode(captured[0])).toBe('hello world');
    });

    it('writing empty data does not trigger callback', () => {
        const captured: Uint8Array[] = [];
        const cli = createWasiCli({ stdout: (bytes) => captured.push(bytes.slice()) });
        const stream = cli.stdout.getStdout();
        stream.write(new Uint8Array(0));
        stream.flush();
        expect(captured.length).toBe(0);
    });

    it('flush with no pending data is a no-op', () => {
        const captured: Uint8Array[] = [];
        const cli = createWasiCli({ stdout: (bytes) => captured.push(bytes.slice()) });
        const stream = cli.stdout.getStdout();
        stream.flush();
        expect(captured.length).toBe(0);
    });

    it('writing binary data preserves bytes', () => {
        const captured: Uint8Array[] = [];
        const cli = createWasiCli({ stdout: (bytes) => captured.push(bytes.slice()) });
        const stream = cli.stdout.getStdout();
        const binary = new Uint8Array([0xFF, 0x00, 0x80]);
        stream.write(binary);
        stream.flush();
        expect(captured[0]).toEqual(binary);
    });
});

describe('wasi:cli/stderr', () => {
    it('getStderr returns an output stream', () => {
        const cli = createWasiCli();
        const stream = cli.stderr.getStderr();
        expect(stream).toBeDefined();
        expect(typeof stream.write).toBe('function');
    });

    it('writing to stderr with capture callback delivers text', () => {
        const captured: Uint8Array[] = [];
        const cli = createWasiCli({ stderr: (bytes) => captured.push(bytes.slice()) });
        const stream = cli.stderr.getStderr();
        stream.write(new TextEncoder().encode('error msg'));
        stream.flush();
        expect(new TextDecoder().decode(captured[0])).toBe('error msg');
    });

    it('stdout and stderr are independent streams', () => {
        const outCapture: Uint8Array[] = [];
        const errCapture: Uint8Array[] = [];
        const cli = createWasiCli({
            stdout: (bytes) => outCapture.push(bytes.slice()),
            stderr: (bytes) => errCapture.push(bytes.slice()),
        });
        cli.stdout.getStdout().write(new TextEncoder().encode('out'));
        cli.stdout.getStdout().flush();
        cli.stderr.getStderr().write(new TextEncoder().encode('err'));
        cli.stderr.getStderr().flush();
        expect(new TextDecoder().decode(outCapture[0])).toBe('out');
        expect(new TextDecoder().decode(errCapture[0])).toBe('err');
        expect(outCapture.length).toBe(1);
        expect(errCapture.length).toBe(1);
    });
});

describe('wasi:cli/terminal-*', () => {
    it('getTerminalStdin returns undefined', () => {
        const cli = createWasiCli();
        expect(cli.terminalInput.getTerminalStdin()).toBeUndefined();
    });

    it('getTerminalStdout returns undefined', () => {
        const cli = createWasiCli();
        expect(cli.terminalOutput.getTerminalStdout()).toBeUndefined();
    });

    it('getTerminalStderr returns undefined', () => {
        const cli = createWasiCli();
        expect(cli.terminalOutput.getTerminalStderr()).toBeUndefined();
    });
});
