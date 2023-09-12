import { AbiPointer, Tcabi_realloc } from '../src/binding/types';

declare module js {
    export type CityInfo = {
        name: string,
        headCount: number,
        budget: bigint,
    }

    export type Imports = {
        sendMessage: (message: string) => void;
    }

    export type Exports = {
        run: (info: CityInfo) => void;
    }

    export type NamedImports = {
        'hello:city/city': Imports
    }

    export type NamedExports = {
        'hello:city/greeter': Exports
    }
}

declare module abi {
    export type module0Exports = {
        memory: WebAssembly.Memory
        cabi_realloc: Tcabi_realloc
        '__data_end': WebAssembly.Global
        '__heap_base': WebAssembly.Global
        // TODO budget: number is wrong, should be BigInt
        'hello:city/greeter#run': (namePtr: AbiPointer, nameLen: AbiPointer, headCount: number, budget: number) => void,
    }

    export type module0Imports = {
        'hello:city/city': {
            'send-message': (prt: AbiPointer, len: AbiPointer) => void
        }
    }

    export type module2Imports = {
        '': {
            $imports: WebAssembly.Table
            '0': (prt: AbiPointer, len: AbiPointer) => void
        }
    }

    export type module1Exports = {
        '0': (prt: AbiPointer, len: AbiPointer) => void,
        $imports: WebAssembly.Table
    }
}
