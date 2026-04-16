/// <reference path="./wasi-clocks-wall-clock.d.ts" />
declare module 'wasi:clocks/timezone@0.2.11' {
  export function display(when: Datetime): TimezoneDisplay;
  export function utcOffset(when: Datetime): number;
  export type Datetime = import('wasi:clocks/wall-clock@0.2.11').Datetime;
  export interface TimezoneDisplay {
    utcOffset: number,
    name: string,
    inDaylightSavingTime: boolean,
  }
}
