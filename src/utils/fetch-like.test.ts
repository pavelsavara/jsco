import { fetchLike, getBodyIfResponse } from './fetch-like';

describe('fetch-like.ts', () => {
    describe('getBodyIfResponse', () => {
        test('returns ArrayLike directly', async () => {
            const arr = new Uint8Array([1, 2, 3]);
            const result = await getBodyIfResponse(arr);
            expect(result).toBe(arr);
        });

        test('returns ReadableStream directly', async () => {
            const stream = new ReadableStream();
            const result = await getBodyIfResponse(stream);
            expect(result).toBe(stream);
        });

        test('unwraps Response body', async () => {
            const body = new ReadableStream();
            const response = { body } as any as Response;
            const result = await getBodyIfResponse(response);
            expect(result).toBe(body);
        });

        test('unwraps PromiseLike<Response>', async () => {
            const body = new ReadableStream();
            const response = { body } as any as Response;
            const promise = Promise.resolve(response);
            const result = await getBodyIfResponse(promise);
            expect(result).toBe(body);
        });

        test('throws on unsupported input', async () => {
            await expect(getBodyIfResponse({} as any)).rejects.toThrow('I got');
        });
    });

    describe('fetchLike', () => {
        test('file:// URL uses fs in node', async () => {
            // We're in node, so fetchLike should use fs.readFile for file:// URLs.
            // We test that it doesn't throw with an invalid path (it will throw from fs).
            await expect(fetchLike('file:///nonexistent/path/test.wasm')).rejects.toThrow();
        });

        test('relative path uses fs in node', async () => {
            // Non-http, non-file URLs fall through to fs.readFile in node
            await expect(fetchLike('./nonexistent.wasm')).rejects.toThrow();
        });
    });
});
