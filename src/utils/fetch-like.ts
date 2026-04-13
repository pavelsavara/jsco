// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

const isNode = typeof process == 'object' && typeof process['versions'] == 'object' && typeof process['versions']['node'] == 'string';

export function fetchLike(url: string) {
    const isFileUrl = url.startsWith('file://');
    const isHttpUrl = url.startsWith('https://') || url.startsWith('http://');
    if (isNode && (isFileUrl || !isHttpUrl)) {
        return import('fs/promises').then((fs) => {
            return fs['readFile'](url);
        });
    }
    if (typeof globalThis.fetch !== 'function') {
        throw new Error('globalThis.fetch is not a function');
    }
    return globalThis.fetch(url);
}

export async function getBodyIfResponse(
    input:
        | ArrayLike<number>
        | ReadableStream<Uint8Array>
        | Response
        | PromiseLike<Response>,
): Promise<ArrayLike<number> | ReadableStream<Uint8Array>> {
    if ('length' in input || 'getReader' in input) {
        return input;
    }
    if ('body' in input) {
        const body = (input as Response)['body'];
        if (!body) throw new Error('Response body is null');
        return getBodyIfResponse(body);
    }
    if ('then' in input) {
        return getBodyIfResponse(await input);
    }
    throw new Error('I got ' + typeof input);
}
