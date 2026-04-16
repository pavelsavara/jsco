declare module "env:*" {
    //Constant that will be inlined by Rollup and rollup-plugin-consts.
    const constant: any;
    export default constant;
}

declare module "@bytecodealliance/jco" {
    export function parse(wat: string): Promise<Uint8Array>;
}