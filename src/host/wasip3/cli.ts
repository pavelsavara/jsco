// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type {
    WasiCliEnvironment,
    WasiCliExit,
    WasiCliTypes,
} from '../../../wit/wasip3/types/index';
import type { WasiP3Config } from './types';

/**
 * Thrown by exit() / exitWithCode() to signal process termination.
 * The host catches this and extracts the exit code.
 */
export class WasiExit extends Error {
    readonly exitCode: number;

    constructor(code: number) {
        super(`WASI exit with code ${code}`);
        this.name = 'WasiExit';
        this.exitCode = code;
    }
}

/**
 * Create the `wasi:cli/environment` interface.
 *
 * Provides `getEnvironment()`, `getArguments()`, and `getInitialCwd()`
 * from the supplied configuration. Returns defensive copies.
 */
export function createEnvironment(config?: WasiP3Config): typeof WasiCliEnvironment {
    const env = config?.env ?? [];
    const args = config?.args ?? [];
    const cwd = config?.cwd;

    return {
        getEnvironment(): Array<[string, string]> {
            // Return a copy to prevent mutation
            return env.map(([k, v]) => [k, v]);
        },

        getArguments(): Array<string> {
            return [...args];
        },

        getInitialCwd(): string | undefined {
            return cwd;
        },
    };
}

type ExitResult = { tag: 'ok'; val: void } | { tag: 'err'; val: void };

/**
 * Create the `wasi:cli/exit` interface.
 *
 * Both `exit()` and `exitWithCode()` throw {@link WasiExit} which the
 * host runtime catches to extract the exit code.
 */
export function createExit(): typeof WasiCliExit {
    return {
        exit(status: ExitResult): void {
            if (status.tag === 'ok') {
                throw new WasiExit(0);
            } else {
                throw new WasiExit(1);
            }
        },

        exitWithCode(statusCode: number): void {
            throw new WasiExit(statusCode);
        },
    };
}

export function createCliTypes(): typeof WasiCliTypes {
    // ErrorCode is just a type alias — no runtime content needed
    return {} as typeof WasiCliTypes;
}
