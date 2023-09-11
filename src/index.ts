// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.types.d.ts" />

import gitHash from 'env:gitHash';
import configuration from 'env:configuration';

export type { WITModel } from './parser';
export { parse } from './parser';
export { createComponent, createComponentFactory } from './resolver';
export { createLifting, createLowering } from './binding';

export function getBuildInfo() {
    return {
        gitHash,
        configuration,
    };
}
