import { ModelTag } from '../model/tags';
import { Source } from '../utils/streaming';
import { ParserContext, CoreModule } from './types';

export async function parseModule(
    ctx: ParserContext,
    src: Source,
    size: number,
): Promise<CoreModule[]> {
    const res: CoreModule = {
        tag: ModelTag.CoreModule,
    };

    if (ctx.compileStreaming) {
        const whileReading = new Promise((resolve) => {
            const response = toWasmResponse(src, size, resolve);
            const module = ctx.compileStreaming(response);
            res.module = module;
        });
        await whileReading;
    }
    else {
        const data = await src.readExact(size);
        res.data = data;
    }
    return [res];
}

function toWasmResponse(
    src: Source,
    size: number,
    resolveWhenDoneReading: (_: any) => void
) {
    let remaining = size;
    const pull = async (controller: ReadableByteStreamController): Promise<void> => {
        const data = await src.readAvailable(remaining);
        if (data === null) {
            resolveWhenDoneReading(undefined);
            controller.close();
        }
        else {
            // copy, otherwise WebAssembly.compileStreaming will detach the underlying buffer.
            const copy = data.slice();
            controller.enqueue(copy);
            remaining -= data.length;
            if (remaining === 0) {
                resolveWhenDoneReading(undefined);
                controller.close();
            }
        }
    };
    const rs = new ReadableStream({
        type: 'bytes', pull,
    });
    const headers = new Headers();
    headers.append('Content-Type', 'application/wasm');
    headers.append('Content-Length', '' + size);
    const response = new Response(rs, {
        headers,
        status: 200,
        statusText: 'OK',
    });

    return response;
}
