// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * CLI integration tests — run the built dist/debug/index.js as a CLI tool.
 *
 * Tests:
 * - jsco --help prints help text
 * - jsco run hello.wasm prints "hello from jsco"
 * - jsco hello.wasm -- arg1 arg2 passes component args
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';

const distIndex = path.resolve('./dist/debug/index.js');
const helloWasm = path.resolve('./integration-tests/hello-world-wat/hello.wasm');
const nodeExe = process.execPath;

function runJsco(args: string[]): { stdout: string; stderr: string; status: number } {
    try {
        const stdout = execFileSync(nodeExe, [
            '--experimental-wasm-jspi',
            '--experimental-vm-modules',
            distIndex,
            ...args,
        ], {
            encoding: 'utf-8',
            timeout: 30_000,
            env: { ...process.env, NODE_NO_WARNINGS: '1' },
        });
        return { stdout, stderr: '', status: 0 };
    } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string; status?: number };
        return {
            stdout: err.stdout ?? '',
            stderr: err.stderr ?? '',
            status: err.status ?? 1,
        };
    }
}

const haveDistDebug = existsSync(distIndex);
const haveHelloWasm = existsSync(helloWasm);
const describeIfBuilt = haveDistDebug ? describe : describe.skip;

describeIfBuilt('CLI integration (dist/debug)', () => {

    test('--help prints help text and exits 0', () => {
        const result = runJsco(['--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('jsco');
        expect(result.stdout).toContain('run');
        expect(result.stdout).toContain('serve');
        expect(result.stdout).toContain('--help');
    });

    test('run --help prints run help text', () => {
        const result = runJsco(['run', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Runs a WebAssembly component');
    });

    test('no args prints usage error', () => {
        const result = runJsco([]);
        expect(result.status).not.toBe(0);
    });

    const describeIfHelloWasm = haveHelloWasm ? describe : describe.skip;

    describeIfHelloWasm('hello-world-wat', () => {
        test('run hello.wasm prints greeting', () => {
            const result = runJsco(['run', helloWasm]);
            expect(result.status).toBe(0);
            expect(result.stdout).toContain('hello from jsco');
        });

        test('hello.wasm without explicit run command', () => {
            const result = runJsco([helloWasm]);
            expect(result.status).toBe(0);
            expect(result.stdout).toContain('hello from jsco');
        });
    });
});
