// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.types.d.ts" />

import gitHash from 'env:gitHash';
import configuration from 'env:configuration';
import { initializeAsserts } from './utils/assert';
import './utils/debug-names'; // registers initDebugNames before setConfiguration
import { GIT_HASH, CONFIGURATION } from './constants';

export { parse } from './parser';
export { instantiateComponent, createComponent } from './resolver';
export { createWasiHost } from './host/wasip2';
export { instantiateWasiComponent } from './host/wasip2/instantiate';
export type { WasiInstantiateOptions } from './host/wasip2/instantiate';
export type { WasiConfig } from './host/wasip2/types';
export type { WasmComponent, WasmComponentInstance, ResolutionStats } from './resolver/api-types';
export { LogLevel, setLogger } from './utils/assert';
export type { Verbosity, LogFn } from './utils/assert';

export function getBuildInfo() {
    return {
        [GIT_HASH]: gitHash,
        [CONFIGURATION]: configuration,
    };
}

initializeAsserts();