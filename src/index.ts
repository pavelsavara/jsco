// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.types.d.ts" />

import gitHash from 'env:gitHash';
import configuration from 'env:configuration';
import { setConfiguration } from './utils/assert';

export type { WITModel } from './parser';
export { parse } from './parser';
export { instantiateComponent, createComponent } from './resolver';
export { createLifting, createLowering } from './resolver/binding';

export function getBuildInfo() {
    return {
        gitHash,
        configuration,
    };
}

setConfiguration(configuration);