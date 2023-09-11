import { FuncType } from '../model/core';
import { ComponentDefinedTypeRecord, ComponentValType, PrimitiveValType } from '../model/types';
import { memoize } from './cache';
import { LiftingFromJs, BindingContext, AbiPointer, FnLiftingFromJs, JsFunction, AbiFunction, JsString, AbiSize } from './types';

export function createImportLifting(exportModel: FuncType): FnLiftingFromJs {
    return memoize(exportModel, () => {
        return (ctx: BindingContext, jsImport: JsFunction): AbiFunction => {
            // TODO
            throw new Error('Not implemented');
        };
    });
}

export function createLifting(typeModel: ComponentValType): LiftingFromJs {
    return memoize(typeModel, () => {
        switch (typeModel.tag) {
            case 'ComponentValTypePrimitive':
                switch (typeModel.value) {
                    case PrimitiveValType.String:
                        return createStringLifting();
                    default:
                        throw new Error('Not implemented');
                }
            default:
                throw new Error('Not implemented');
        }
    });
}

/* 
See https://github.com/WebAssembly/component-model/blob/main/design/mvp/canonical-abi/definitions.py for alignment rules

See https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md

From https://github.com/WebAssembly/component-model/blob/main/design/mvp/Explainer.md
lift wraps a core function (of type core:functype) to produce a component function (of type functype) that can be passed to other components.
lower wraps a component function (of type functype) to produce a core function (of type core:functype) that can be imported and called from Core WebAssembly code inside the current component.
*/

function createRecordLifting(recordModel: ComponentDefinedTypeRecord): LiftingFromJs {
    const liftingMembers: Map<string, LiftingFromJs> = new Map();
    for (const member of recordModel.members) {

        //member.name
        const lifting = createLifting(member.type);
        liftingMembers.set(member.name, lifting);
    }
    throw new Error('Not implemented');
    /*
    return (ctx: BindingContext, srcJsRecord: JsRecord, tgtPointer: AbiPointer): AbiPointer => {

        // TODO in which cases ABI expects folding into parent record ?
        const res = ctx.alloc(recordModel.totalSize, recordModel.alignment);

        let pos = res as any;
        for (let i = 0; i < recordModel.members.length; i++) {
            const member = recordModel.members[i];
            const lifting = liftingMembers[i];
            const alignment = member.type.alignment as any;
            const jsValue = srcJsRecord[member.name];
            // TODO is this correct math ?
            pos += alignment - 1;
            pos -= pos % alignment;
            lifting(ctx, jsValue, pos as AbiPointer);
            pos += member.type.totalSize as any;
        }
        // write pointer to parent in component model layout
        if (tgtPointer !== 0) {
            ctx.writeI32(tgtPointer, res);
        }

        return [res, recordModel.totalSize];
    };*/
}

function createStringLifting(): LiftingFromJs {
    return (ctx: BindingContext, srcJsString: JsString): any[] => {
        let str = srcJsString as string;
        if (typeof str !== 'string') throw new TypeError('expected a string');
        if (str.length === 0) {
            return [0, 0];
        }
        let allocLen: AbiSize = 0 as any;
        let ptr: AbiPointer = 0 as any;
        let writtenTotal = 0;
        while (str.length > 0) {
            ptr = ctx.realloc(ptr, allocLen, 1 as any, allocLen + str.length as any);
            allocLen += str.length as any;
            const { read, written } = ctx.utf8Encoder.encodeInto(
                str,
                // TODO us ctx.view
                new Uint8Array(ctx.getMemory().buffer, ptr + writtenTotal, allocLen - writtenTotal),
            );
            writtenTotal += written;
            str = str.slice(read);
        }
        if (allocLen > writtenTotal)
            ptr = ctx.realloc(ptr, allocLen, 1 as any, writtenTotal as any);
        return [ptr, writtenTotal];
    };
}
