// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.types.d.ts" />

import gitHash from 'env:gitHash';
import configuration from 'env:configuration';
import { setConfiguration } from './utils/assert';
import './utils/debug-names'; // registers initDebugNames before setConfiguration

export type { WITModel } from './parser';
export { parse } from './parser';
export { instantiateComponent, createComponent } from './resolver';
export { createLifting, createLowering } from './resolver/binding';
export { createWasiHost } from './host/wasip2';
export { instantiateWasiComponent } from './host/wasip2/instantiate';
export type { WasiInstantiateOptions } from './host/wasip2/instantiate';
export type { WasiConfig } from './host/wasip2/types';
export { LogLevel, setLogger } from './utils/assert';
export type { Verbosity, LogFn } from './utils/assert';
export { printWAT } from './utils/wat-printer';

export function getBuildInfo() {
    return {
        gitHash,
        configuration,
    };
}

setConfiguration(configuration);