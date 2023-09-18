//! Pavel Savara licenses this file to you under the MIT license.
var e="Release";function n(e,n){if(e)return;const t="Assert failed: "+("function"==typeof n?n():n);throw new Error(t)}let t="Debug",r=!1;function o(e,n,t){if(!r)return;const o=e.debugStack??[];n.debugStack=[t,...o]}const s="object"==typeof process&&"object"==typeof process.versions&&"string"==typeof process.versions.node;async function a(e){if("length"in e||"getReader"in e)return e;if("body"in e)return a(e.body);if("then"in e)return a(await e);throw new Error("I got "+typeof e)}class c{total;bpos;buf;reader;constructor(e){this.total=0,this.bpos=0,this.buf=null,this.reader=e.getReader()}get pos(){return this.total}async fill(e){if(null===this.buf||this.buf.length-this.bpos<1){const e=await this.reader.read();if(e.done)return"EOF";this.buf=e.value,this.bpos=0}const n=this.bpos,t=Math.min(this.buf.length-n,e);return this.bpos+=t,this.total+=t,this.buf.subarray(n,n+t)}async readAvailable(e){if(null===this.buf||this.buf.length-this.bpos<1){const e=await this.reader.read();if(e.done)return null;this.buf=e.value,this.bpos=0}const n=this.bpos,t=Math.min(this.buf.length-n,e);return this.bpos+=t,this.total+=t,this.buf.subarray(n,n+t)}async read(e){const n=await this.fill(1);if("EOF"===n){if(!0===e)return null;throw new Error("unexpected EOF.")}return n[0]}async readExact(e){const n=new Uint8Array(e);let t=e;for(;t>0;){const e=await this.fill(t);if("EOF"===e)throw new Error("unexpected EOF.");n.set(e,n.length-t),t-=e.length}return n}async skip(e){if(e<0)throw new Error("illegal argument.");let n=e;for(;n>0;){const e=await this.fill(n);if("EOF"===e)throw new Error("unexpected EOF.");n-=e.length}}subSource(e){return new u(this,e)}async subSyncSource(e){const n=await this.readExact(e);return new l(n)}close(){this.reader.releaseLock()}}class i{_pos;items;constructor(e){this._pos=0,this.items=Uint8Array.from(e)}get pos(){return this._pos}readAvailable(e){if(0===this.items.byteLength||this._pos==this.items.byteLength||0===e)return Promise.resolve(null);const n=Math.min(this.items.byteLength-this._pos,e),t=this.items.subarray(this._pos,this._pos+n);return this._pos+=t.byteLength,Promise.resolve(t)}read(e){try{if(this.items.length-this._pos<1){if(e)return Promise.resolve(null);throw new Error("unexpected EOF.")}const n=this.items[this._pos];return this._pos+=1,Promise.resolve(n)}catch(e){return Promise.reject(e)}}readExact(e){try{if(0===e)return Promise.resolve(Uint8Array.from([]));if(e<1)throw new Error("illegal argument.");if(this.items.length-this._pos<e)throw new Error("unexpected EOF.");const n=this.items.subarray(this._pos,this._pos+e);return this._pos+=e,Promise.resolve(n)}catch(e){return Promise.reject(e)}}skip(e){try{if(0===e)return Promise.resolve();if(e<1)throw new Error("illegal argument.");if(this.items.length-this._pos<e)throw new Error("unexpected EOF.");return this._pos+=e,Promise.resolve()}catch(e){return Promise.reject(e)}}subSource(e){return new u(this,e)}async subSyncSource(e){const n=await this.readExact(e);return new l(n)}close(){}}class u{delegate;rest;constructor(e,n){if(n<0)throw new Error("illegal argument.");this.delegate=e,this.rest=n}get pos(){return this.delegate.pos}async readAvailable(e){const n=Math.min(e,this.rest),t=await this.delegate.readAvailable(n);return t&&(this.rest-=t.byteLength),t}async read(e){let n;return this.checkLimit(1),n=!0===e?await this.delegate.read(!0):await this.delegate.read(),n&&(this.rest-=1),n}async readExact(e){this.checkLimit(e);const n=await this.delegate.readExact(e);return this.rest-=n.length,n}async skip(e){this.checkLimit(e),await this.delegate.skip(e),this.rest-=e}subSource(e){return new u(this,e)}async subSyncSource(e){const n=await this.readExact(e);return new l(n)}checkLimit(e){if(this.rest<e)throw new Error("limit reached.")}}class l{_pos;items;constructor(e){this._pos=0,this.items=Uint8Array.from(e)}get pos(){return this._pos}get remaining(){return this.items.length-this._pos}read(e){if(this.items.length-this._pos<1&&!e)throw new Error("unexpected EOF.");const n=this.items[this._pos];return this._pos+=1,n}readExact(e){if(0===e)return Uint8Array.from([]);if(e<1)throw new Error("illegal argument.");if(this.items.length-this._pos<e)throw new Error("unexpected EOF.");const n=this.items.subarray(this._pos,this._pos+e);return this._pos+=e,n}skip(e){if(0!==e){if(e<1)throw new Error("illegal argument.");if(this.items.length-this._pos<e)throw new Error("unexpected EOF.");this._pos+=e}}}const m=((e,n=(e=>void 0!==e?": "+e:""))=>class extends Error{constructor(t){super(e(t)+n(t))}})((()=>"unsupported operation")),p=Symbol(),d=()=>{};class f{constructor(e){this.value=e}deref(){return this.value}}const g=e=>e instanceof f,h=e=>e instanceof f?e.deref():e;function*w(e,n){const t=(r=e,((e,n)=>null!=e&&"function"==typeof e.xform)(r)?r.xform():r)([d,d,(e,n)=>n])[2];var r;for(let e of n){let n=t(p,e);if(g(n))return n=h(n.deref()),void(n!==p&&(yield n));n!==p&&(yield n)}}let y,A;if("undefined"!=typeof window&&void 0!==window.WebAssembly||"undefined"!=typeof global&&void 0!==global.WebAssembly){const e=new WebAssembly.Instance(new WebAssembly.Module(function e(n){return n?new Uint8Array([...w(e(),n)]):e=>{const n=e[2];let t=0,r=0;return((e,o)=>[e[0],e[1],(e,o)=>{switch(o){case"-":o="+";break;case"_":o="/";break;case"=":return(e=>new f(e))(e)}const s="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".indexOf(o);return r=3&t?(r<<6)+s:s,3&t++&&(e=n(e,255&r>>(-2*t&6))),e}])(e)}}("AGFzbQEAAAABCgJgAX4Bf2AAAX4DBQQAAQABBQMBABEGCQF/AEGAgMAACwdYBgZtZW1vcnkCAA9sZWIxMjhFbmNvZGVVNjQAAANidWYDAA9sZWIxMjhEZWNvZGVVNjQAAQ9sZWIxMjhFbmNvZGVJNjQAAg9sZWIxMjhEZWNvZGVJNjQAAwrBAwRbAQJ/AkAgAEKAAVoEQANAIAFBgIBAayAAp0H/AHEgAEL/AFZBB3RyOgAAIAFBAWohASAAQoABVCAAQgeIIQBFDQALDAELQYCAwAAgADwAAEEBIQELIAFB/wFxC1ECA38CfgNAAkAgAEEBaiECIABBgIBAaywAACIBQf8Aca0gA4YgBIQhBCABQQBODQAgA0IHfCEDIABBCUkgAiEADQELC0GAgMAAIAI6AAAgBAuRAQEDfwJAIABCQH1CgAFaBEBBASECA0AgAkEBcUUNAiABQYCAQGtBAEGAfyAApyICQcAAcSIDRSAAQoABVHEgA0EGdiAAQgeHIgBCf1FxciIDGyACQf8AcXI6AAAgA0UhAiABQQFqIQEMAAsAC0GAgMAAIABCOYinQcAAcSAAp0E/cXI6AABBASEBCyABQf8BcQt+AgN/A35BfyEAA0ACQCAAQQFqIQEgA0IHfCEFIABBgYDAAGotAAAiAEH/AHGtIAOGIASEIQQgAMAiAkEATg0AIAEhACAFIQMgAUEJSQ0BCwtBgIDAACABQQFqOgAAIARCfyAFhkIAIAJBwABxQQZ2G0IAIAFB/wFxQQlJG4QL")));y=e.exports,A=new Uint8Array(y.memory.buffer,y.buf,16)}const E=(e,n=0)=>{!y&&(e=>{throw new m("WASM module unavailable")})(),A.set(e.subarray(n,Math.min(n+10,e.length)),0);const t=y.leb128DecodeU64(0,0);return[BigInt.asUintN(64,t),A[0]]},x=new TextDecoder;function C(e){return function(e,n,t,r){const o=function(e){const n=[];for(let t=0;t<H;t++){const t=e.read();if(n.push(t),0==(128&t))break}return Uint8Array.from(n)}(e),[s,a]=r(o);if(a!==o.length)throw new Error(`invalid data. ${a} !== ${o.length}`);if(s<0||s>4294967295)throw new Error(`overflow. ${z}, ${s}`);return Number(s)}(e,0,0,E)}function b(e){const n=C(e),t=[];for(let r=0;r<n;r++)t.push(I(e));return t}function I(e){const n=C(e),t=e.readExact(n);return x.decode(t)}function T(e){switch(e){case 0:return"func";case 1:return"table";case 2:return"memory";case 3:return"global";case 4:return"tag";default:throw new Error(`unknown external kind. ${e}`)}}function v(e){const n=C(e);return 0==n?F(n,C(e)):F(n)}function F(e,n){switch(e){case 0:if(17===n)return"module";throw new Error(`unknown component external kind 2. ${n}`);case 1:return"func";case 2:return"value";case 3:return"type";case 4:return"component";case 5:return"instance";default:throw new Error(`unknown component external kind. 0x${e.toString(16)}`)}}function k(e){const n=C(e),t=[];for(let r=0;r<n;r++){let n;switch(e.read()){case 0:n={tag:"InstanceTypeDeclarationCoreType",value:void 0};break;case 1:n={tag:"InstanceTypeDeclarationType",value:U(e)};break;case 2:n={tag:"InstanceTypeDeclarationAlias",value:void 0};break;case 4:n={tag:"InstanceTypeDeclarationExport",name:S(e),ty:L(e)}}t.push(n)}return t}function S(e){const n=C(e);switch(n){case 0:return{tag:"ComponentExternNameKebab",name:I(e)};case 1:return{tag:"ComponentExternNameInterface",name:I(e)};default:throw new Error(`unknown ComponentExternName. ${n}`)}}function D(e){switch(e.read()){case 0:return;case 1:return C(e);default:throw new Error("Invalid leading byte in resource destructor")}}function $(e){const n=C(e),t=[];for(let r=0;r<n;r++)t.push({name:I(e),kind:v(e),index:C(e)});return t}function B(e){const n=e.read();switch(n){case 0:return{tag:"CoreInstanceInstantiate",module_index:C(e),args:_(e)};case 1:return{tag:"CoreInstanceFromExports",exports:Q(e)};default:throw new Error(`Unrecognized type in readCoreInstance: ${n}`)}}function Q(e){const n=C(e),t=[];for(let r=0;r<n;r++){const n=I(e),r=C(e),o=C(e);t.push({name:n,kind:T(r),index:o})}return t}function _(e){const n=C(e),t=[];for(let r=0;r<n;r++){const n=I(e),r=R(e),o=C(e);t.push({name:n,kind:r,index:o})}return t}function R(e){const n=e.read();if(18!=n)throw new Error(`Unrecognized kind in readInstantiationArgKind: ${n}`);return"instance"}function O(e){const n=e.read();switch(n){case 0:{const n=e.read();if(0!=n)throw new Error(`Unrecognized byte for CanonicalFunctionLift in readCanonicalFunction: ${n}`);return{tag:"CanonicalFunctionLift",core_func_index:C(e),options:M(e),type_index:C(e)}}case 1:{const n=e.read();if(0!=n)throw new Error(`Unrecognized byte for CanonicalFunctionLower in readCanonicalFunction: ${n}`);return{tag:"CanonicalFunctionLower",func_index:C(e),options:M(e)}}case 2:return{tag:"CanonicalFunctionResourceNew",resource:C(e)};case 3:return{tag:"CanonicalFunctionResourceDrop",resource:C(e)};case 4:return{tag:"CanonicalFunctionResourceRep",resource:C(e)};default:throw new Error(`Unrecognized type in readCanonicalFunction: ${n}`)}}function M(e){const n=C(e),t=[];for(let r=0;r<n;r++)t.push(N(e));return t}function N(e){const n=e.read();switch(n){case 0:return{tag:"CanonicalOptionUTF8"};case 1:return{tag:"CanonicalOptionUTF16"};case 2:return{tag:"CanonicalOptionCompactUTF16"};case 3:return{tag:"CanonicalOptionMemory",value:C(e)};case 4:return{tag:"CanonicalOptionRealloc",value:C(e)};case 5:return{tag:"CanonicalOptionPostReturn",value:C(e)};default:throw new Error(`Unrecognized type in readCanonicalOption = ${n}.`)}}function U(e){const n=e.read();switch(n){case 63:return{tag:"ComponentTypeResource",rep:C(e),dtor:D(e)};case 64:return{tag:"ComponentTypeFunc",params:W(e),results:j(e)};case 65:return{tag:"ComponentTypeComponent",declarations:void 0};case 66:return{tag:"ComponentTypeInstance",declarations:k(e)};default:return function(e,n){switch(n){case 104:return{tag:"ComponentTypeDefinedBorrow",value:C(e)};case 105:return{tag:"ComponentTypeDefinedOwn",value:C(e)};case 106:return{tag:"ComponentTypeDefinedResult",ok:V(e),err:V(e)};case 107:return{tag:"ComponentTypeDefinedOption",value:V(e)};case 109:return{tag:"ComponentTypeDefinedEnum",members:b(e)};case 110:return{tag:"ComponentTypeDefinedFlags",members:b(e)};case 111:{const n=C(e),t=[];for(let r=0;r<n;r++)t.push(V(e));return{tag:"ComponentTypeDefinedTuple",members:t}}case 112:return{tag:"ComponentTypeDefinedList",value:V(e)};case 113:{const n=C(e),t=[];for(let r=0;r<n;r++)t.push({name:I(e),ty:V(e),refines:C(e)});return{tag:"ComponentTypeDefinedVariant",variants:t}}case 114:{const n=C(e),t=[];for(let r=0;r<n;r++)t.push({name:I(e),type:V(e)});return{tag:"ComponentTypeDefinedRecord",members:t}}default:throw new Error(`Unrecognized type in readComponentTypeDefined: ${n}`)}}(e,n)}}function L(e){const n=C(e);switch(n){case 0:return{tag:"ComponentTypeRefModule",value:C(e)};case 1:return{tag:"ComponentTypeRefFunc",value:C(e)};case 2:return{tag:"ComponentTypeRefValue",value:V(e)};case 3:return{tag:"ComponentTypeRefType",value:G(e)};case 4:return{tag:"ComponentTypeRefInstance",value:C(e)};case 5:return{tag:"ComponentTypeRefComponent",value:C(e)};default:throw new Error(`unknown ComponentExternName. ${n}`)}}function W(e){const n=[],t=C(e);for(let r=0;r<t;r++)n.push({name:I(e),type:V(e)});return n}function j(e){const n=e.read();switch(n){case 0:return{tag:"ComponentFuncResultUnnamed",type:V(e)};case 1:return{tag:"ComponentFuncResultNamed",values:W(e)};default:throw new Error(`unknown ComponentFuncResult type: ${n}`)}}function V(e){const n=C(e);return 115<=n&&n<=127?{tag:"ComponentValTypePrimitive",value:Z(n)}:{tag:"ComponentValTypeType",value:n}}function G(e){const n=C(e);switch(n){case 0:return{tag:"TypeBoundsEq",value:C(e)};case 1:return{tag:"TypeBoundsSubResource"};default:throw new Error(`unknown type bounds. ${n}`)}}function Z(e){switch(e){case 127:return"bool";case 126:return"s8";case 125:return"u8";case 124:return"s16";case 123:return"u16";case 122:return"s32";case 121:return"u32";case 120:return"s64";case 119:return"u64";case 118:return"f32";case 117:return"f64";case 116:return"char";case 115:return"string";default:throw new Error(`unknown primitive val type. ${e}`)}}function P(e,n){switch(e){case 0:switch(n){case 16:return"coretype";case 17:return"coremodule";default:throw new Error(`unknown outer alias kind 2. ${n}`)}case 3:return"type";case 4:return"component";default:throw new Error(`unknown outer alias kind. ${e}`)}}const z=32,H=0|Math.ceil(z/7);function J(e,n){const t=[],r=C(n);for(let e=0;e<r;e++){const e={tag:"ComponentExport",name:S(n),kind:v(n),index:C(n),ty:0===C(n)?void 0:L(n)};t.push(e)}return t}function Y(e,n,t){const r=C(e);switch(r){case 0:return{tag:"ComponentAliasInstanceExport",kind:F(n,t),instance_index:C(e),name:I(e)};case 1:return{tag:"ComponentAliasCoreInstanceExport",kind:T(t),instance_index:C(e),name:I(e)};case 2:return{tag:"ComponentAliasOuter",kind:P(n,t),count:C(e),index:C(e)};default:throw new Error(`unknown target type. ${r}`)}}const q=[0,97,115,109],K=[13,0],X=[1,0];async function ee(e,n){let t=e;"string"==typeof e&&(t=function(e){const n=e.startsWith("file://"),t=e.startsWith("https://")||e.startsWith("http://");if(s&&(n||!t))return import("fs/promises").then((n=>n.readFile(e)));if("function"!=typeof globalThis.fetch)throw new Error("globalThis.fetch is not a function");return globalThis.fetch(e)}(e)),t=await a(t);const r="getReader"in(o=t)?new c(o):new i(o);var o;const u=await async function(e,n){try{await ne(e);const t={otherSectionData:n?.otherSectionData??!1,compileStreaming:n?.compileStreaming??WebAssembly.compileStreaming,processCustomSection:n?.processCustomSection??void 0},r=[];for(;;){const n=await te(t,e);if(null===n)break;for(const e of n)r.push(e)}return r}finally{e.close()}}(r,n);return u}async function ne(e){const n=await e.readExact(q.length),t=await e.readExact(K.length),r=await e.readExact(X.length);if(!(n.every(((e,n)=>e===q[n]))&&t.every(((e,n)=>e===K[n]))&&r.every(((e,n)=>e===X[n]))))throw new Error("unexpected magic, version or layer.")}async function te(e,n){const t=await n.read(!0);if(null===t)return null;const r=await async function(e){return await async function(e,n,t,r){const o=await async function(e){const n=[];for(let t=0;t<H;t++){const t=await e.read();if(n.push(t),0==(128&t))break}return Uint8Array.from(n)}(e),[s,a]=r(o);if(a!==o.length)throw new Error(`invalid data. ${a} !== ${o.length}`);if(s<0||s>4294967295)throw new Error(`overflow. ${z}, ${s}`);return Number(s)}(e,0,0,E)}(n),o=n.pos,s=1==t||4==t?n.subSource(r):void 0,a=1!=t&&4!=t?await n.subSyncSource(r):void 0,c=await(()=>{switch(t){case 0:return function(e,n,t){const r=n.pos,o=I(n),s=n.pos-r,a=n.readExact(t-s);let c={tag:"CustomSection",name:o,data:e.otherSectionData?a:void 0};return e.processCustomSection&&(c=e.processCustomSection(c)),[c]}(e,a,r);case 1:return async function(e,n,t){const r={tag:"CoreModule"};if(e.compileStreaming){const o=new Promise((o=>{const s=function(e,n,t){let r=n;const o=new ReadableStream({type:"bytes",pull:async n=>{const o=await e.readAvailable(r);if(null===o)t(void 0),n.close();else{const e=o.slice();n.enqueue(e),r-=o.length,0===r&&(t(void 0),n.close())}}}),s=new Headers;return s.append("Content-Type","application/wasm"),s.append("Content-Length",""+n),new Response(o,{headers:s,status:200,statusText:"OK"})}(n,t,o),a=e.compileStreaming(s);r.module=a}));await o}else{const e=await n.readExact(t);r.data=e}return[r]}(e,s,r);case 2:return function(e,n){const t=[],r=C(n);for(let e=0;e<r;e++){const e=B(n);t.push(e)}return t}(0,a);case 4:return async function(e,n,t){const r=n.pos+t;await ne(n);let o=[];for(;n.pos!=r;){const t=await te(e,n);if(null===t)break;o=[...o,...t]}return[{tag:"ComponentSection",sections:o}]}(e,s,r);case 5:return function(e,n){const t=[],r=C(n);for(let e=0;e<r;e++){const e=(()=>{const e=C(n);switch(e){case 0:return{tag:"ComponentInstanceInstantiate",component_index:C(n),args:$(n)};case 1:return{tag:"ComponentInstanceFromExports",exports:J(0,n)};default:throw new Error(`Unrecognized type in parseSectionInstance: ${e}`)}})();t.push(e)}return t}(0,a);case 6:return function(e,n){const t=C(n),r=[];for(let e=0;e<t;e++){const e=C(n),t=Y(n,e,0===e?C(n):void 0);r.push(t)}return r}(0,a);case 7:return function(e,n){const t=[],r=C(n);for(let e=0;e<r;e++){const e=U(n);t.push(e)}return t}(0,a);case 8:return function(e,n){const t=[],r=C(n);for(let e=0;e<r;e++){const e=O(n);t.push(e)}return t}(0,a);case 10:return function(e,n){const t=[],r=C(n);for(let e=0;e<r;e++){const e={tag:"ComponentImport",name:S(n),ty:L(n)};t.push(e)}return t}(0,a);case 11:return J(0,a);case 3:case 9:return function(e,n,t,r){const o=n.readExact(r);return[{tag:"SkippedSection",type:t,data:e.otherSectionData?o:void 0}]}(e,a,t,r);default:throw new Error(`unknown section: ${t}`)}})();if(a&&0!==a.remaining){const e=o+a.pos,n=o+r,s=a.remaining,i=a.readExact(s).reduce(((e,n)=>e+" "+n.toString(16).padStart(2,"0")),"");throw new Error(`invalid size after reading section ${t}: \nactual position: 0x${e.toString(16)} vs. expected position 0x${n.toString(16)}, remaining ${s}\nsection: ${JSON.stringify(c)}\nremaining: `+i)}return c}const re=new Map;function oe(e,n){let t=re.get(e);return void 0!==t||(t=n(),re.set(e,t)),t}function se(e,n){return oe(n,(()=>{if("ComponentValTypePrimitive"===n.tag){if("string"===n.value)return function(e){const n=(e,...n)=>{const t=n[0],r=n[1],o=e.getView(t,r);return e.utf8Decoder.decode(o)};return n.spill=2,n}();throw new Error("Not implemented")}throw new Error("Not implemented")}))}function ae(e,t){return oe(t,(()=>{switch(t.tag){case"ComponentValTypePrimitive":switch(t.value){case"string":return(e,n)=>{let t=n;if("string"!=typeof t)throw new TypeError("expected a string");if(0===t.length)return[0,0];let r=0,o=0,s=0;for(;t.length>0;){o=e.realloc(o,r,1,r+t.length),r+=t.length;const{read:n,written:a}=e.utf8Encoder.encodeInto(t,e.getViewU8(o+s,r-s));s+=a,t=t.slice(n)}return r>s&&(o=e.realloc(o,r,1,s)),[o,s]};case"u32":return(e,n)=>[n>>>0];case"s64":return e.usesNumberForInt64?(e,n)=>{const t=n;return[Number(BigInt.asIntN(52,t))]}:(e,n)=>{const t=n;return[BigInt.asIntN(52,t)]};default:throw new Error("Not implemented")}case"ComponentAliasInstanceExport":{const n=e.indexes.componentInstances[t.instance_index];return ae(e,n)}case"ComponentTypeInstance":{const n=t.declarations[0];return ae(e,n)}case"InstanceTypeDeclarationType":{const r=t.value;return n("ComponentTypeDefinedRecord"===r.tag,(()=>`expected ComponentTypeDefinedRecord, got ${r.tag}`)),function(e,n){const t=[];for(const r of n.members){const n=ae(e,r.type);t.push({name:r.name,lifter:n})}return(e,n)=>{let r=[];for(const{name:o,lifter:s}of t){const t=s(e,n[o]);r=[...r,...t]}return r}}(e,r)}case"ComponentValTypeType":{const n=e.indexes.componentTypes[t.value];return ae(e,n)}default:throw new Error("Not implemented "+t.tag)}}))}var ce=function(e){for(var n=e.split(ie),t=n.length,r=new Array(t),o=0;o<t;o++){var s=n[o];if(""!==s){var a=ue.test(s)&&!me.test(s);a&&(s=s.replace(le,(function(e,n,t){return pe(e,s.length-t-e.length==0)})));var c=s[0];c=o>0?c.toUpperCase():c.toLowerCase(),r[o]=c+(a?s.slice(1):s.slice(1).toLowerCase())}}return r.join("")},ie=/[\s\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-.\/:;<=>?@\[\]^_`{|}~]+/,ue=/^[a-z\u00E0-\u00FCA-Z\u00C0-\u00DC][\d|a-z\u00E0-\u00FCA-Z\u00C0-\u00DC]*$/,le=/([A-Z\u00C0-\u00DC]{4,})/g,me=/^[A-Z\u00C0-\u00DC]+$/;function pe(e,n){var t=e.split(""),r=t.shift().toUpperCase(),o=n?t.pop().toLowerCase():t.pop();return r+t.join("").toLowerCase()+o}const de=(e,n)=>{const t=n.element;switch(t.tag){case"ComponentInstanceInstantiate":return fe(e,n);case"ComponentTypeInstance":return ge(e,n);default:throw new Error(`"${t.tag}" not implemented`)}},fe=(e,t)=>{const r=t.element;n(r&&"ComponentInstanceInstantiate"==r.tag,(()=>`Wrong element type '${r?.tag}'`));const s=r.component_index,a=((e,t)=>{const r=t.element;if(!r)throw new Error("Wrong element type ");switch(r.tag){case"ComponentSection":return((e,t)=>{const r=t.element;n(r&&"ComponentSection"==r.tag,(()=>`Wrong element type '${r?.tag}'`));const s=[];for(const n of r.sections)switch(n.tag){case"ComponentExport":if("func"===n.kind){const t=Te(e,{element:n,callerElement:n});s.push(t)}else if("type"!==n.kind)throw new Error("Not implemented");break;case"ComponentImport":case"ComponentTypeFunc":case"ComponentTypeDefinedRecord":case"ComponentTypeDefinedTuple":case"ComponentTypeDefinedEnum":case"ComponentTypeDefinedVariant":break;default:throw new Error(`${n.tag} not implemented`)}return{callerElement:t.callerElement,element:r,binder:async(e,n)=>{const r={};for(const a of s){const s=a.callerElement,c={arguments:n.arguments,imports:n.imports,callerArgs:n,debugSource:s.tag+":"+s.name.name};o(n,c,t.element.tag+":"+t.element.selfSortIndex),o(c,c,s.tag+":"+s.name.name);const i=await a.binder(e,c);r[s.name.name]=i.result}return{result:r}}}})(e,t);case"ComponentAliasInstanceExport":return Ie(e,t);default:throw new Error(`"${r.tag}" not implemented`)}})(e,{element:e.indexes.componentTypes[s],callerElement:r}),c=[];for(const n of r.args)switch(n.kind){case"func":{const t=e.indexes.componentFunctions[n.index],r=Ce(e,{element:t,callerElement:n});c.push(r);break}case"instance":{const t=e.indexes.componentInstances[n.index],r=de(e,{element:t,callerElement:n});c.push(r);break}case"type":break;default:throw new Error(`"${n.kind}" not implemented`)}return{callerElement:t.callerElement,element:r,binder:async(e,n)=>{const s=he(e,r.selfSortIndex);Object.assign(s.result,n.imports);const i={};for(const r of c){const s=r.callerElement,a={arguments:n.arguments,imports:n.imports,callerArgs:n};o(n,a,t.element.tag+":"+t.element.selfSortIndex),o(a,a,"ComponentInstantiationArg:"+s.index+":"+s.name);const c=await r.binder(e,a);let u=s.name;u.startsWith("import-func-")&&(u=u.substring(12)),u=ce(u),i[u]=c.result}Object.assign(s.result.exports,i);const u={imports:i,callerArgs:n};o(n,u,t.element.tag+":"+t.element.selfSortIndex);const l=await a.binder(e,u);return s.result=l.result,s}}},ge=(e,t)=>{const r=t.element;return n(r&&"ComponentTypeInstance"==r.tag,(()=>`Wrong element type '${r?.tag}'`)),{callerElement:t.callerElement,element:r,binder:async(e,n)=>{const t=he(e,r.selfSortIndex);return Object.assign(t.result.exports,n.imports),Object.assign(t.result.types,r.declarations),t}}};function he(e,n){let t=e.componentInstances[n];return t||(t={result:{instanceIndex:n,imports:{},exports:{},types:{}}},e.componentInstances[n]=t),t}const we=(e,n)=>{const t=n.element;switch(t.tag){case"CoreInstanceFromExports":return ye(e,n);case"CoreInstanceInstantiate":return Ae(e,n);default:throw new Error(`"${t.tag}" not implemented`)}},ye=(e,t)=>{const r=t.element;n(r&&"CoreInstanceFromExports"==r.tag,(()=>`Wrong element type '${r?.tag}'`));const s=[];for(const n of r.exports)switch(n.kind){case"func":{const t=e.indexes.coreFunctions[n.index],r=Ee(e,{element:t,callerElement:n});s.push(r);break}case"table":{const t=e.indexes.coreTables[n.index],r=Ee(e,{element:t,callerElement:n});s.push(r);break}default:throw new Error(`"${n.kind}" not implemented`)}return{element:r,callerElement:t.callerElement,binder:async(e,n)=>{const r={};for(const a of s){const s=a.callerElement,c={arguments:n.arguments,imports:n.imports,callerArgs:n};o(n,c,t.element.tag+":"+t.element.selfSortIndex),o(c,c,s.kind+":"+s.name);const i=await a.binder(e,c);r[s.name]=i.result}return{result:r}}}},Ae=(e,t)=>{const r=t.element,s=r.selfSortIndex;n(r&&"CoreInstanceInstantiate"==r.tag,(()=>`Wrong element type '${r?.tag}'`));const a=r.module_index,c=((e,t)=>{const r=t.element;return n(r&&"CoreModule"==r.tag,(()=>`Wrong element type '${r?.tag}'`)),{callerElement:t.callerElement,element:r,binder:async(e,n)=>({result:await r.module})}})(0,{element:e.indexes.coreModules[a],callerElement:r}),i=[];for(const n of r.args)switch(n.kind){case"instance":{const t=e.indexes.coreInstances[n.index],r=we(e,{callerElement:n,element:t});i.push(r);break}default:throw new Error(`"${n.kind}" not implemented`)}return{element:r,callerElement:t.callerElement,binder:async(n,r)=>{let a=n.coreInstances[s];if(a)return a;a={},n.coreInstances[s]=a;const u={debugSource:t.element.tag};for(const e of i){const s=e.callerElement,a={arguments:r.arguments,imports:r.imports,callerArgs:r};o(r,a,t.element.tag+":"+t.element.selfSortIndex),o(a,a,s.index+":"+s.name);const c=await e.binder(n,a);u[s.name]=c.result}const l={callerArgs:r};o(r,l,t.element.tag+":"+t.element.selfSortIndex);const m=(await c.binder(n,l)).result,p=(await e.wasmInstantiate(m,u)).exports,d=p.memory;d&&n.initializeMemory(d);const f=p.cabi_realloc;return f&&n.initializeRealloc(f),a.result=p,a}}},Ee=(e,n)=>{const t=n.element;switch(t.tag){case"ComponentAliasCoreInstanceExport":return((e,n)=>{const t=n.element,r=t.instance_index,s=e.indexes.coreInstances[r],a=we(e,{element:s,callerElement:t});return{callerElement:n.callerElement,element:t,binder:async(e,r)=>{const s={missing:n.element.tag,callerArgs:r};return o(r,s,n.element.tag+":"+n.element.selfSortIndex),{result:(await a.binder(e,s)).result[t.name]}}}})(e,n);case"CanonicalFunctionLower":return xe(e,n);default:throw new Error(`"${t.tag}" not implemented`)}},xe=(e,t)=>{const r=t.element;n(r&&"CanonicalFunctionLower"==r.tag,(()=>`Wrong element type '${r?.tag}'`));const s=e.indexes.componentFunctions[r.func_index],a=Ce(e,{element:s,callerElement:r}),c=function(e,n){return oe(n,(()=>(t,r)=>{const o=[];for(const e of n.params){const n=se(0,e.type);o.push(n)}const s=[];switch(n.results.tag){case"ComponentFuncResultNamed":for(const t of n.results.values){const n=ae(e,t.type);s.push(n)}break;case"ComponentFuncResultUnnamed":{const t=ae(e,n.results.type);s.push(t)}}return function(...e){let n=[];for(let r=0;r<o.length;){const s=o[r],a=s.spill,c=e.slice(r,r+a),i=s(t,...c);r+=a,n=[...n,i]}const a=r(...n);1===s.length&&s[0](a)}}))}(e,e.indexes.componentInstances[0].declarations[2].value);return{callerElement:t.callerElement,element:r,binder:async(e,n)=>{const r={arguments:n.arguments,imports:n.imports,callerArgs:n};o(n,r,t.element.tag+":"+t.element.selfSortIndex),o(r,r,s.tag+":"+s.selfSortIndex);const i=await a.binder(e,r);return{result:c(e,i.result)}}}},Ce=(e,n)=>{const t=n.element;switch(t.tag){case"CanonicalFunctionLift":return be(e,n);case"ComponentAliasInstanceExport":return Ie(e,n);default:throw new Error(`"${t.tag}" not implemented`)}},be=(e,t)=>{const r=t.element;n(r&&"CanonicalFunctionLift"==r.tag,(()=>`Wrong element type '${r?.tag}'`));const s=e.indexes.coreFunctions[r.core_func_index],a=Ee(e,{element:s,callerElement:r}),c=e.indexes.componentTypes[r.type_index];n("ComponentTypeFunc"===c.tag,(()=>`expected ComponentTypeFunc, got ${c.tag}`));const i=function(e,n){return oe(n,(()=>{const t=[];for(const r of n.params){const n=ae(e,r.type);t.push(n)}const r=[];switch(n.results.tag){case"ComponentFuncResultNamed":for(const e of n.results.values){const n=se(0,e.type);r.push(n)}break;case"ComponentFuncResultUnnamed":{const e=se(0,n.results.type);r.push(e)}}return(e,n)=>function(...o){let s=[];for(let n=0;n<t.length;n++){const r=t[n],a=o[n],c=r(e,a);s=[...s,...c]}const a=n(...s);1===r.length&&r[0](a)}}))}(e,c);return{callerElement:t.callerElement,element:r,binder:async(e,n)=>{const r={arguments:n.arguments,imports:n.imports,callerArgs:n};o(n,r,t.element.tag+":"+t.element.selfSortIndex);const s=await a.binder(e,r);return{result:i(e,s.result)}}}},Ie=(e,t)=>{const r=t.element;if(n(r&&"ComponentAliasInstanceExport"==r.tag,(()=>`Wrong element type '${r?.tag}'`)),"type"===r.kind)return{callerElement:t.callerElement,element:r,binder:async(e,n)=>({missingRes:t.element.tag,confused:1,result:{missingResTypes:t.element.tag}})};if("func"!==r.kind)throw new Error(`"${r.kind}" not implemented`);const s=e.indexes.componentInstances[r.instance_index],a=de(e,{element:s,callerElement:r});return{callerElement:t.callerElement,element:r,binder:async(e,n)=>{const s={arguments:n.arguments,imports:n.imports,callerArgs:n};o(n,s,t.element.tag+":"+t.element.selfSortIndex);const c=await a.binder(e,s);let i;const u=s.arguments?.[0];if(u)i=c.result.exports[u];else{const e=ce(r.name);i=c.result.imports[e]}return{result:i}}}},Te=(e,t)=>{const r=t.element;switch(n(r&&"ComponentExport"==r.tag,(()=>`Wrong element type '${r?.tag}'`)),r.kind){case"func":{const n=e.indexes.componentFunctions[r.index],s=Ce(e,{element:n,callerElement:r});return{callerElement:t.callerElement,element:r,binder:async(e,n)=>{const a={arguments:[r.name.name],imports:n.imports,callerArgs:n};return o(n,a,t.element.tag+":"+t.element.name.name+":"+t.element.kind),{result:(await s.binder(e,a)).result}}}}case"instance":{const n=e.indexes.componentInstances[r.index],s=de(e,{element:n,callerElement:r});return{callerElement:t.callerElement,element:r,binder:async(e,n)=>{const a={arguments:n.arguments,imports:n.imports,callerArgs:n};o(n,a,t.element.tag+":"+t.element.name.name+":"+t.element.kind);const c=await s.binder(e,a),i={};return i[r.name.name]=c.result,{result:i}}}}case"type":throw new Error("TODO types");default:throw new Error(`${r.kind} not implemented`)}},ve=(e,t)=>{const r=t.element;if(n(r&&"ComponentImport"==r.tag,(()=>`Wrong element type '${r?.tag}'`)),"ComponentTypeRefComponent"===r.ty.tag)return{callerElement:t.callerElement,element:r,binder:async(e,n)=>{const t=he(e,r.selfSortIndex),o=n.imports[r.name.name];return Object.assign(t.result.imports,o),t}};throw new Error(`${r.ty.tag} not implemented`)};function Fe(e,n,t,r){switch(n){case"CoreModule":return e.indexes.coreModules;case"ComponentExport":return e.indexes.componentExports;case"ComponentImport":return e.indexes.componentImports;case"ComponentAliasCoreInstanceExport":switch(r){case"func":return e.indexes.coreFunctions;case"table":return e.indexes.coreTables;case"memory":return e.indexes.coreMemories;case"global":return e.indexes.coreGlobals;default:throw new Error(`unexpected section tag: ${r}`)}break;case"ComponentAliasInstanceExport":switch(r){case"func":return e.indexes.componentFunctions;case"component":case"type":return e.indexes.componentTypes;default:throw new Error(`unexpected section tag: ${r}`)}case"CoreInstanceFromExports":case"CoreInstanceInstantiate":return e.indexes.coreInstances;case"ComponentInstanceFromExports":case"ComponentInstanceInstantiate":return e.indexes.componentInstances;case"ComponentTypeFunc":return e.indexes.componentTypes;case"ComponentSection":return t?e.indexes.componentTypes:e.indexes.componentSections;case"ComponentTypeDefinedBorrow":case"ComponentTypeDefinedEnum":case"ComponentTypeDefinedFlags":case"ComponentTypeDefinedList":case"ComponentTypeDefinedOption":case"ComponentTypeDefinedOwn":case"ComponentTypeDefinedPrimitive":case"ComponentTypeDefinedRecord":case"ComponentTypeDefinedResult":case"ComponentTypeDefinedTuple":case"ComponentTypeDefinedVariant":return e.indexes.componentTypes;case"ComponentTypeInstance":return e.indexes.componentInstances;case"ComponentTypeResource":return e.indexes.componentTypeResource;case"CanonicalFunctionLower":return e.indexes.coreFunctions;case"CanonicalFunctionLift":return e.indexes.componentFunctions;case"SkippedSection":case"CustomSection":return[];default:throw new Error(`unexpected section tag: ${n}`)}}async function ke(e,n,t){let r=e;return("object"!=typeof r||Array.isArray(r)&&0!=r.length&&"object"!=typeof r[0])&&(r=await ee(r,t??{})),(await Se(r,t)).instantiate(n)}async function Se(e,n){let o=e;("object"!=typeof o||Array.isArray(o)&&0!=o.length&&"object"!=typeof o[0])&&(o=await ee(o,n??{}));const s=function(e,n){const t={usesNumberForInt64:!0===n.useNumberForInt64,wasmInstantiate:n.wasmInstantiate??WebAssembly.instantiate,indexes:{componentExports:[],componentImports:[],componentFunctions:[],componentInstances:[],componentTypes:[],componentTypeResource:[],coreModules:[],coreInstances:[],coreFunctions:[],coreMemories:[],coreTables:[],coreGlobals:[],componentSections:[]}},r=t.indexes;for(const n of e)Fe(t,n.tag,!1,n.kind).push(n);return t.indexes.componentTypes=[...t.indexes.componentSections,...r.componentTypes],function(e){function n(e){for(let n=0;n<e.length;n++)e[n].selfSortIndex=n}n(e.indexes.componentExports),n(e.indexes.componentImports),n(e.indexes.componentFunctions),n(e.indexes.componentInstances),n(e.indexes.componentTypes),n(e.indexes.componentTypeResource),n(e.indexes.coreModules),n(e.indexes.coreInstances),n(e.indexes.coreFunctions),n(e.indexes.coreMemories),n(e.indexes.coreTables),n(e.indexes.coreGlobals)}(t),t}(o,n??{});for(const e of s.indexes.coreModules)await e.module;const a=[];for(const e of s.indexes.coreInstances){const n=we(s,{element:e,callerElement:void 0});a.push(n)}const c=[];for(const e of s.indexes.componentImports){const n=ve(s,{element:e,callerElement:void 0});c.push(n)}const i=[];for(const e of s.indexes.componentExports){const n=Te(s,{element:e,callerElement:void 0});i.push(n)}return{instantiate:async function(e){const n=function(e,n){let r,o;function s(e,n){return new DataView(r.buffer,e,n)}const a={componentImports:n,coreInstances:[],componentInstances:[],utf8Decoder:new TextDecoder,utf8Encoder:new TextEncoder,initializeMemory:function(e){r=e},initializeRealloc:function(e){o=e},getView:s,getViewU8:function(e,n){return new Uint8Array(r.buffer,e,n)},getMemory:function(){return r},realloc:function(e,n,t,r){return o(e,n,t,r)},alloc:function(e,n){return o(0,0,n,e)},readI32:function(e){return s().getInt32(e)},writeI32:function(e,n){return s().setInt32(e,n)},abort:function(){throw new Error("not implemented")}};return"Debug"===t&&(a.debugStack=[]),a}(0,e=e??{}),o={};for(const t of c){const s={imports:e};r&&(s.debugStack=[]);const a=await t.binder(n,s);Object.assign(o,a.result)}const s={};for(const e of i){const t={};r&&(t.debugStack=[]);const o=await e.binder(n,t);Object.assign(s,o.result)}for(const e of a){const t={};r&&(t.debugStack=[]),await e.binder(n,t)}return{exports:s,abort:n.abort}}}}function De(){return{gitHash:"258ed845f5354b8e4ac7310ddf41107c7cc11bce",configuration:e}}t=e,r=!1;export{Se as createComponent,ae as createLifting,se as createLowering,De as getBuildInfo,ke as instantiateComponent,ee as parse};
//# sourceMappingURL=index.js.map
