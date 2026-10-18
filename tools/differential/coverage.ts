// API coverage of a differential run: wraps every public method of the library (exported classes, value objects,
// and the prototypes of every library object the harness gets back: views, iterators, streams, ...) and counts the
// calls the harness makes directly (calls the library makes internally are not counted). Rows are the public API
// read from the declarations (api.ts); the result says, per row, how often it was exercised in compared ops.
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as lib from '../../src/index';
import type { ApiRow } from './api';

const WRAPPED = Symbol('covWrapped');
const SET_BRAND = Symbol.for('@nodestd/collections.Set');
/** Harness subclasses of library skeletons carry this static (see tsRunner). */
export const HARNESS = Symbol.for('@nodestd/collections.diff.harness');

let depth = 0;
/** true while classifying a receiver (its property reads must not count) */
let resolving = false;
let active = false;
const counts = new Map<string, number>();
/** per non-exported implementation class: interface rows it was credited for */
const implClasses = new Map<string, { ifaces: string[]; members: Set<string> }>();

export function hit(key: string): void {
  if (active && depth === 0) counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Runs a harness callback that the library invokes as if it were top level (e.g. a gatherer integrator calling push). */
export function top<F extends (...a: any[]) => any>(fn: F): F {
  return function (this: unknown, ...a: any[]) {
    const d = depth;
    depth = 0;
    if (active) for (const x of a) instrumentObject(x); // e.g. the Downstream handed to an integrator
    try {
      return fn.apply(this, a);
    } finally {
      depth = d;
    }
  } as F;
}

const BUILTIN_PROTOS = new Set<object>([Object.prototype, Array.prototype, Function.prototype, Error.prototype, Map.prototype, Set.prototype,
  Promise.prototype, String.prototype, Number.prototype, Boolean.prototype]);

let api: ApiRow[] = [];
let exportedClasses = new Map<Function, string>();
/** interface name -> its member names (functions only) */
let ifaceMembers = new Map<string, string[]>();
const SET_IFACES = new Set(['Set', 'SequencedSet', 'SortedSet', 'NavigableSet']);

function interfacesOf(o: any): string[] {
  const out: string[] = [];
  for (const [name, ms] of ifaceMembers) {
    if (SET_IFACES.has(name) && o[SET_BRAND] !== true) continue;
    // an interface with no function members left (Integrator once greedy is dropped) would match everything
    if (ms.length !== 0 && ms.every((m) => typeof o[m] === 'function')) out.push(name);
  }
  return out;
}

/** Name of a library-internal implementation class; object literals and anonymous classes get a readable label. */
function implLabel(ctor: any): string {
  return ctor?.name || '(anonymous)';
}

/** Owner label(s) for a receiver: an exported class name, or the public interfaces a library-internal object implements. */
const ownerCache = new WeakMap<object, string[]>();
function ownersOf(self: any): string[] {
  if (self === null || (typeof self !== 'object' && typeof self !== 'function')) return [];
  const proto = typeof self === 'function' ? self : Object.getPrototypeOf(self);
  if (proto === null) return [];
  const cached = ownerCache.get(proto);
  if (cached) return cached;
  let owners: string[];
  const ctor = typeof self === 'function' ? self : self.constructor;
  if (exportedClasses.has(ctor)) owners = [exportedClasses.get(ctor)!];
  else if (ctor && ctor[HARNESS]) {
    let c = Object.getPrototypeOf(ctor);
    while (c && !exportedClasses.has(c)) c = Object.getPrototypeOf(c);
    owners = c ? [exportedClasses.get(c)!] : [];
  } else {
    owners = interfacesOf(self).map((i) => `${i}`);
    const implName = implLabel(ctor);
    if (!implClasses.has(implName)) implClasses.set(implName, { ifaces: owners, members: new Set() });
  }
  ownerCache.set(proto, owners);
  return owners;
}

function wrapFn(holder: any, key: PropertyKey, fixedOwner: string | null): void {
  const d = Object.getOwnPropertyDescriptor(holder, key);
  if (!d || typeof d.value !== 'function' || d.value[WRAPPED] || !d.writable && !d.configurable) return;
  const orig = d.value;
  if (/^class\s/.test(Function.prototype.toString.call(orig))) return; // class-valued statics (Spliterators.AbstractSpliterator)
  const name = typeof key === 'symbol' ? `[${key.description}]` : key;
  const wrapper = function (this: any, ...args: any[]) {
    if (active && depth === 0 && !resolving) {
      resolving = true;
      let owners: string[];
      try {
        // statics called through a subclass (LinkedHashMap.newHashMap) count for that subclass
        owners = fixedOwner !== null ? [typeof this === 'function' && exportedClasses.has(this) ? exportedClasses.get(this)! : fixedOwner] : ownersOf(this);
      } finally {
        resolving = false;
      }
      for (const o of owners) {
        const k = `${o}.${name}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      if (fixedOwner === null && owners.length > 0 && !exportedClasses.has(this?.constructor)) {
        const impl = implClasses.get(implLabel(this?.constructor));
        impl?.members.add(String(name));
      }
    }
    depth++;
    let r: any;
    try {
      r = orig.apply(this, args);
    } finally {
      depth--;
    }
    if (active && depth === 0) instrumentObject(r);
    return r;
  };
  (wrapper as any)[WRAPPED] = true;
  Object.defineProperty(wrapper, 'length', { value: orig.length });
  Object.defineProperty(wrapper, 'name', { value: orig.name });
  try {
    Object.defineProperty(holder, key, { ...d, value: wrapper });
  } catch {
    /* frozen */
  }
}

const seenProtos = new WeakSet<object>();
/** Library prototypes are those of classes (source starts with `class`); built-in iterators and the like are skipped. */
const isLibraryProto = (p: any) => {
  const c = Object.prototype.hasOwnProperty.call(p, 'constructor') ? p.constructor : null;
  return typeof c === 'function' && /^class\s/.test(Function.prototype.toString.call(c));
};

function instrumentProtoChain(p: any): void {
  for (; p && !BUILTIN_PROTOS.has(p) && isLibraryProto(p); p = Object.getPrototypeOf(p)) {
    if (seenProtos.has(p)) continue;
    seenProtos.add(p);
    if ((p.constructor as any)?.[HARNESS]) continue; // harness overrides are not library code
    for (const k of Reflect.ownKeys(p)) if (k !== 'constructor') wrapFn(p, k, null);
  }
}

/** Instruments the prototypes of a library object returned to the harness (views, iterators, streams, ...). */
export function instrumentObject(o: any): void {
  if (o === null || typeof o !== 'object' || Array.isArray(o) || ArrayBuffer.isView(o)) return;
  const p = Object.getPrototypeOf(o);
  if (p === Object.prototype) {
    // plain-object singletons (empty iterators, ...): wrap own function properties
    if (!seenProtos.has(o)) {
      seenProtos.add(o);
      for (const k of Reflect.ownKeys(o)) wrapFn(o, k, null);
    }
    return;
  }
  instrumentProtoChain(p);
}

/** Installs the instrumentation. Call before running any script. */
export function install(): void {
  if (active) return;
  // loaded lazily: the TypeScript compiler is only needed when coverage is on
  api = (require('./api') as typeof import('./api')).readApi();
  exportedClasses = new Map();
  ifaceMembers = new Map();
  for (const r of api) if (r.kind === 'interface' && !r.member.startsWith('[')) {
    const ms = ifaceMembers.get(r.owner) ?? [];
    ms.push(r.member);
    ifaceMembers.set(r.owner, ms);
  }
  // only function-valued members decide whether an object implements an interface
  for (const [name, ms] of ifaceMembers) ifaceMembers.set(name, ms.filter((m) => !['length', 'greedy'].includes(m)));
  ifaceMembers.delete('WritableArrayLike');
  ifaceMembers.delete('Comparable');
  ifaceMembers.delete('RandomAccess');
  for (const [name, v] of Object.entries(lib)) {
    if (typeof v === 'function' && (v as any).prototype && /^class\s/.test(Function.prototype.toString.call(v))) {
      exportedClasses.set(v as Function, name);
    }
  }
  for (const [name, v] of Object.entries(lib)) {
    if (typeof v === 'function' && exportedClasses.has(v as Function)) {
      instrumentProtoChain((v as any).prototype);
      for (const k of Reflect.ownKeys(v)) if (!['prototype', 'length', 'name'].includes(String(k))) wrapFn(v, k, name);
    } else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) wrapFn(v, k, name);
      // nested statics objects (Map.Entry)
      for (const [k2, sub] of Object.entries(v)) if (sub && typeof sub === 'object' && !Array.isArray(sub)) for (const k3 of Object.keys(sub)) wrapFn(sub, k3, `${name}.${k2}`);
    }
  }
  active = true;
}

export interface CoverageData {
  counts: Record<string, number>;
  impls: Record<string, { ifaces: string[]; members: string[] }>;
}

export function snapshot(): CoverageData {
  const impls: CoverageData['impls'] = {};
  for (const [k, v] of implClasses) impls[k] = { ifaces: v.ifaces, members: [...v.members].sort() };
  return { counts: Object.fromEntries(counts), impls };
}

export function mergeCoverage(into: CoverageData, from: CoverageData): void {
  for (const [k, n] of Object.entries(from.counts)) into.counts[k] = (into.counts[k] ?? 0) + n;
  for (const [k, v] of Object.entries(from.impls)) {
    const cur = into.impls[k];
    into.impls[k] = cur ? { ifaces: cur.ifaces, members: [...new Set([...cur.members, ...v.members])].sort() } : v;
  }
}
