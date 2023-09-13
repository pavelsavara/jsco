import { FuncType } from '../model/core';
import { ModelTag } from '../model/tags';
import { ComponentDefinedTypeRecord, ComponentValType, PrimitiveValType } from '../model/types';
import { ResolverContext } from '../resolver/types';
import { memoize } from './cache';
import { LiftingFromJs, BindingContext, WasmPointer, FnLiftingFromJs, JsFunction, WasmSize, WasmValue, WasmFunction, JsValue } from './types';

export function createImportLifting(rctx: ResolverContext, exportModel: FuncType): FnLiftingFromJs {
    return memoize(exportModel, () => {
        return (ctx: BindingContext, jsImport: JsFunction): WasmFunction => {
            // TODO
            throw new Error('Not implemented');
        };
    });
}

export function createLifting(rctx: ResolverContext, typeModel: ComponentValType): LiftingFromJs {
    return memoize(typeModel, () => {
        switch (typeModel.tag) {
            case ModelTag.ComponentValTypePrimitive:
                switch (typeModel.value) {
                    case PrimitiveValType.String:
                        return createStringLifting();
                    case PrimitiveValType.U32:
                        return createU32Lifting();
                    case PrimitiveValType.S64:
                        return rctx.usesNumberForInt64
                            ? createS64LiftingNumber()
                            : createS64LiftingBigInt();
                    default:
                        throw new Error('Not implemented');
                }
            case ModelTag.ComponentValTypeType:
                //TODO resolve typeModel.value
                throw new Error('Not implemented');
            default:
                throw new Error('Not implemented');
        }
    });
}

function createRecordLifting(rctx: ResolverContext, recordModel: ComponentDefinedTypeRecord): LiftingFromJs {
    const liftingMembers: Map<string, LiftingFromJs> = new Map();
    for (const member of recordModel.members) {

        //member.name
        const lifting = createLifting(rctx, member.type);
        liftingMembers.set(member.name, lifting);
    }
    throw new Error('Not implemented');
    /*
    return (ctx: BindingContext, srcJsRecord: JsRecord, tgtPointer: Pointer): Pointer => {

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
            lifting(ctx, jsValue, pos as Pointer);
            pos += member.type.totalSize as any;
        }
        // write pointer to parent in component model layout
        if (tgtPointer !== 0) {
            ctx.writeI32(tgtPointer, res);
        }

        return [res, recordModel.totalSize];
    };*/
}

function createU32Lifting(): LiftingFromJs {
    return (_: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = srcJsValue as number;
        return [num >>> 0];
    };
}

function createS64LiftingNumber(): LiftingFromJs {
    return (ctx: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = srcJsValue as bigint;
        return [Number(BigInt.asIntN(52, num))];
    };
}

function createS64LiftingBigInt(): LiftingFromJs {
    return (ctx: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = srcJsValue as bigint;
        return [BigInt.asIntN(52, num)];
    };
}

function createStringLifting(): LiftingFromJs {
    return (ctx: BindingContext, srcJsValue: JsValue): any[] => {
        let str = srcJsValue as string;
        if (typeof str !== 'string') throw new TypeError('expected a string');
        if (str.length === 0) {
            return [0, 0];
        }
        let allocLen: WasmSize = 0 as any;
        let ptr: WasmPointer = 0 as any;
        let writtenTotal = 0;
        while (str.length > 0) {
            ptr = ctx.realloc(ptr, allocLen, 1 as any, allocLen + str.length as any);
            allocLen += str.length as any;
            const { read, written } = ctx.utf8Encoder.encodeInto(
                str,
                ctx.getViewU8(ptr + writtenTotal, allocLen - writtenTotal)
            );
            writtenTotal += written;
            str = str.slice(read);
        }
        if (allocLen > writtenTotal)
            ptr = ctx.realloc(ptr, allocLen, 1 as any, writtenTotal as any);
        return [ptr, writtenTotal];
    };
}
