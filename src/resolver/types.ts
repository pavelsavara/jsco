import { AbiPointer, AbiSize } from "../binding/types";

// TODO is this correct signature ?
export type Tcabi_realloc = (oldPtr: AbiPointer, oldSize: AbiSize, align: AbiSize, newSize: AbiSize) => AbiPointer;
