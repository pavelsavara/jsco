// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { ErrorContextTable } from './model/types';

function notYetImplemented(name: string): never {
    throw new Error(`${name} is not yet implemented`);
}

export function createErrorContextTable(): ErrorContextTable {
    return {
        newErrorContext() { return notYetImplemented('error-context.new'); },
        debugMessage() { notYetImplemented('error-context.debug-message'); },
        drop() { notYetImplemented('error-context.drop'); },
        add() { return notYetImplemented('error-context.add'); },
        get() { return notYetImplemented('error-context.get'); },
        remove() { return notYetImplemented('error-context.remove'); },
    };
}
