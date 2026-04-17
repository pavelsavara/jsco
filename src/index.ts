// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./__mocks__/.types.d.ts" />

import gitHash from 'env:gitHash';
import configuration from 'env:configuration';
import { initializeAsserts } from './utils/assert';
import './utils/debug-names'; // registers initDebugNames before setConfiguration
import { GIT_HASH, CONFIGURATION } from './utils/constants';
import { cliMain } from './main';

export type { WasmComponent, WasmComponentInstance } from './resolver/api-types';
export { instantiateComponent, createComponent } from './resolver';
export { LogLevel, setLogger } from './utils/assert';

/**
 * Dynamically load the WASIp3 host module.
 *
 * On Node.js, loads `wasip3-node` (full bundle with real TCP/UDP/DNS).
 * In the browser, loads `wasip3` (browser-compatible stubs for sockets).
 */
export async function loadWasip3Host() {
    if (typeof process !== 'undefined' && process.versions?.node) {
        return import('./host/wasip3/node/wasip3');
    }
    return import('./host/wasip3/wasip3');
}

export function getBuildInfo() {
    return {
        [GIT_HASH]: gitHash,
        [CONFIGURATION]: configuration,
    };
}

initializeAsserts();

await cliMain();