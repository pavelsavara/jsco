import { ComponentAliasInstanceExport } from '../model/aliases';
import { ModelTag } from '../model/tags';
import { ComponentTypeDefined, ComponentTypeDefinedRecord, ComponentTypeFunc, ComponentTypeInstance, ComponentValType, InstanceTypeDeclaration, InstanceTypeDeclarationType, PrimitiveValType } from '../model/types';
import { ResolverContext } from '../resolver/types';
import { jsco_assert } from '../utils/assert';
import { memoize } from './cache';
import { createLowering } from './to-js';
import { LiftingFromJs, BindingContext, WasmPointer, FnLiftingCallFromJs, JsFunction, WasmSize, WasmValue, WasmFunction, JsValue } from './types';


export function createImportLifting(rctx: ResolverContext, importModel: ComponentTypeFunc): FnLiftingCallFromJs {
    return memoize(importModel, () => {
        const paramLifters: Function[] = [];
        for (const param of importModel.params) {
            const lifter = createLifting(rctx, param.type);
            paramLifters.push(lifter);
        }
        const resultLowerers: Function[] = [];
        switch (importModel.results.tag) {
            case ModelTag.ComponentFuncResultNamed: {
                for (const res of importModel.results.values) {
                    const lowerer = createLowering(rctx, res.type);
                    resultLowerers.push(lowerer);
                }
                break;
            }
            case ModelTag.ComponentFuncResultUnnamed: {
                const lowerer = createLowering(rctx, importModel.results.type);
                resultLowerers.push(lowerer);
            }
        }

        return (ctx: BindingContext, wasmFunction: WasmFunction): JsFunction => {
            function liftingTrampoline(...args: any[]): any {
                let covertedArgs: any[] = [];
                for (let i = 0; i < paramLifters.length; i++) {
                    const lifter = paramLifters[i];
                    const value = args[i];
                    const converted = lifter(ctx, value);
                    // TODO do not alwas spill into stack
                    covertedArgs = [...covertedArgs, ...converted];
                }
                const resJs = wasmFunction(...covertedArgs);
                if (resultLowerers.length === 1) {
                    resultLowerers[0](resJs);
                }
            }
            return liftingTrampoline as JsFunction;
        };
    });
}


export function createLifting(rctx: ResolverContext, typeModel: ComponentValType | ComponentTypeInstance | InstanceTypeDeclaration | ComponentTypeDefined | ComponentAliasInstanceExport): LiftingFromJs {
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
            case ModelTag.ComponentAliasInstanceExport: {
                const resolved = rctx.indexes.componentInstances[typeModel.instance_index];
                return createLifting(rctx, resolved as any);
            }
            case ModelTag.ComponentTypeInstance: {
                const resolved = typeModel.declarations[0];
                return createLifting(rctx, resolved as any);
            }
            case ModelTag.InstanceTypeDeclarationType: {
                const resolved = typeModel.value;
                jsco_assert(resolved.tag === ModelTag.ComponentTypeDefinedRecord, () => `expected ComponentTypeDefinedRecord, got ${resolved.tag}`);
                return createRecordLifting(rctx, resolved);
            }
            case ModelTag.ComponentValTypeType: {
                const resolved = rctx.indexes.componentTypes[typeModel.value];
                return createLifting(rctx, resolved as any);
            }
            default:
                //return createRecordLifting(rctx, typeModel.value);
                throw new Error('Not implemented ' + typeModel.tag);
        }
    });
}

function createRecordLifting(rctx: ResolverContext, recordModel: ComponentTypeDefinedRecord): LiftingFromJs {
    const lifters: { name: string, lifter: LiftingFromJs }[] = [];
    for (const member of recordModel.members) {
        const lifter = createLifting(rctx, member.type);
        lifters.push({ name: member.name, lifter });
    }
    return (ctx: BindingContext, srcJsRecord: JsValue): WasmValue[] => {
        // this is spilling into stack
        // TODO allocate on heap
        let args: any = [];
        for (const { name, lifter } of lifters) {
            const jsValue = srcJsRecord[name];
            const wasmValue = lifter(ctx, jsValue);
            args = [...args, ...wasmValue];
        }
        return args;
    };
    /*return (ctx: BindingContext, srcJsRecord: JsRecord, tgtPointer: Pointer): Pointer => {

        // TODO in which cases ABI expects folding into parent record ?
        const res = ctx.alloc(recordModel.totalSize, recordModel.alignment);

        let pos = res as any;
        for (let i = 0; i < recordModel.members.length; i++) {
            const member = recordModel.members[i];
            const lifting = lifters[i];
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
