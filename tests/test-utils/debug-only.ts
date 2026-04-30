// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import isDebug from 'env:isDebug';

/**
 * Use in place of `describe()` for test suites that exercise debug-only
 * internal APIs (e.g. createLifting, createLowering, printWAT).
 * Skips the entire suite when Configuration=Release.
 */
export const describeDebugOnly: typeof describe = isDebug ? describe : describe.skip;
