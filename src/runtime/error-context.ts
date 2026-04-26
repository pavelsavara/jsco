// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { ErrorContextTable } from './model/types';

function notYetImplemented(name: string): never {
    throw new Error(`${name} is not yet implemented`);
}

export function createErrorContextTable(): ErrorContextTable {
    return {
        newErrorContext(): never { return notYetImplemented('error-context.new'); },
        debugMessage(): void { notYetImplemented('error-context.debug-message'); },
        drop(): void { notYetImplemented('error-context.drop'); },
        add(): never { return notYetImplemented('error-context.add'); },
        get(): never { return notYetImplemented('error-context.get'); },
        remove(): never { return notYetImplemented('error-context.remove'); },
    };
}
