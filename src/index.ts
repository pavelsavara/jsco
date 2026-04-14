// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.types.d.ts" />

import gitHash from 'env:gitHash';
import configuration from 'env:configuration';
import { initializeAsserts } from './utils/assert';
import './utils/debug-names'; // registers initDebugNames before setConfiguration
import { GIT_HASH, CONFIGURATION } from './constants';
import { cliMain } from './args';

export type { WasmComponent, WasmComponentInstance } from './resolver/api-types';
export { instantiateComponent, createComponent } from './resolver';
export { LogLevel, setLogger } from './utils/assert';

export function getBuildInfo() {
    return {
        [GIT_HASH]: gitHash,
        [CONFIGURATION]: configuration,
    };
}

initializeAsserts();

await cliMain();