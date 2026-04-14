// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

export interface CliOptions {
    useNumberForInt64: boolean;
    noJspi: boolean;
    validateTypes: boolean;
}

export interface CliParseResult {
    componentUrl: string | undefined;
    options: CliOptions;
    error: string | undefined;
}

export function parseCliArgs(args: string[]): CliParseResult {
    let componentUrl: string | undefined;
    let error: string | undefined;
    const options: CliOptions = {
        useNumberForInt64: false,
        noJspi: false,
        validateTypes: true,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg) continue;
        if (arg === '--use-number-for-int64') {
            options.useNumberForInt64 = true;
        } else if (arg === '--no-jspi') {
            options.noJspi = true;
        } else if (arg === '--validate-types') {
            options.validateTypes = true;
        } else if (arg.startsWith('--component=')) {
            componentUrl = arg.substring('--component='.length);
        } else if (arg.endsWith('.wasm') && i === args.length - 1) {
            componentUrl = arg;
        } else {
            error = `Unknown argument: ${arg}`;
            return { componentUrl, options, error };
        }
    }

    if (!componentUrl) {
        error = 'usage: npx @pavelsavara/jsco [--use-number-for-int64] [--no-jspi] [--validate-types] path/to/component.wasm';
    }

    return { componentUrl, options, error };
}
