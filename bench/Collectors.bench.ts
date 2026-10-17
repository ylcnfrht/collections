// Collectors driven directly (supplier -> accumulator -> finisher) vs hand-written native code over 100k elements.
import type { Collector } from '../src/stream/Collector';
import { HashMap } from '../src/map/HashMap';
import { Collectors } from '../src/stream/Collectors';
import { compare } from './harness';

const N = 100_000;
const ints: number[] = [];
const strs: string[] = [];
for (let i = 0; i < N; i++) {
  ints.push(i);
  strs.push('s' + i);
}

// Each case writes its own driver loop: one shared loop would see every collector's accumulator,
// go megamorphic and measure that instead (a stream engine's shared loop pays it too).
function parts<T, A, R>(c: Collector<T, A, R>) {
  return { sup: c.supplier(), acc: c.accumulator(), fin: c.finisher() };
}

export default async function () {
  const toList = parts(Collectors.toList<number>());
  await compare('Collectors.toList 100k', {
    ours: () => {
      const a = toList.sup();
      for (let i = 0; i < ints.length; i++) toList.acc(a, ints[i]);
      return a;
    },
    'native push': () => {
      const out: number[] = [];
      for (let i = 0; i < ints.length; i++) out.push(ints[i]);
      return out;
    },
  });

  const grouping = parts(Collectors.groupingBy((n: number) => n % 100, Collectors.counting()));
  await compare('Collectors.groupingBy(counting) 100k', {
    ours: () => {
      const a = grouping.sup();
      for (let i = 0; i < ints.length; i++) grouping.acc(a, ints[i]);
      return grouping.fin(a);
    },
    'native Map': () => {
      const m = new Map<number, number>();
      for (let i = 0; i < ints.length; i++) {
        const k = ints[i] % 100;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return m;
    },
  });

  const joining = parts(Collectors.joining(','));
  await compare('Collectors.joining 100k', {
    ours: () => {
      const a = joining.sup();
      for (let i = 0; i < strs.length; i++) joining.acc(a, strs[i]);
      return joining.fin(a);
    },
    'native push+join': () => {
      const out: string[] = [];
      for (let i = 0; i < strs.length; i++) out.push(strs[i]);
      return out.join(',');
    },
  });

  const toMap = parts(Collectors.toMap((s: string) => s, (s: string) => s.length));
  await compare('Collectors.toMap 100k', {
    ours: () => {
      const a = toMap.sup();
      for (let i = 0; i < strs.length; i++) toMap.acc(a, strs[i]);
      return a;
    },
    // separates collector overhead from the cost of the library's HashMap itself
    'hand-written HashMap': () => {
      const m = new HashMap<string, number>();
      for (let i = 0; i < strs.length; i++) {
        const s = strs[i];
        if (m.putIfAbsent(s, s.length) !== null) throw new Error('dup');
      }
      return m;
    },
    'native Map': () => {
      const m = new Map<string, number>();
      for (let i = 0; i < strs.length; i++) {
        const s = strs[i];
        if (m.has(s)) throw new Error('dup');
        m.set(s, s.length);
      }
      return m;
    },
  });

  const partition = parts(Collectors.partitioningBy((n: number) => n % 2 === 0));
  await compare('Collectors.partitioningBy 100k', {
    ours: () => {
      const a = partition.sup();
      for (let i = 0; i < ints.length; i++) partition.acc(a, ints[i]);
      return a;
    },
    'native two arrays': () => {
      const t: number[] = [];
      const f: number[] = [];
      for (let i = 0; i < ints.length; i++) (ints[i] % 2 === 0 ? t : f).push(ints[i]);
      return [t, f];
    },
  });
}
