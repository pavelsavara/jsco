import { parse } from './index';

describe('parser test', () => {
    test('to fail on invalid header', async () => {
        const wasm = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
        expect(async () => await parse(wasm)).rejects.toThrowError('unexpected magic, version or layer.');
    });
});
