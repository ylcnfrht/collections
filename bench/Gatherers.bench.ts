// Built-in gatherers driven by the local sequential evaluator vs hand-written loops.
import { ImmutableList } from '../src/immutable/ImmutableCollections';
import { Gatherers } from '../src/stream/Gatherers';
import { gather } from '../tests/stream/gatherers/evaluate';
import { compare } from './harness';

export default async function () {
  const N = 100_000;
  const input = Array.from({ length: N }, (_, i) => i);
  const windowFixed = Gatherers.windowFixed<number>(100);
  // the user callback is part of the workload, so the hand-written loops call it too
  const add = (a: number, b: number) => a + b;
  const scan = Gatherers.scan(() => 0, add);
  const fold = Gatherers.fold(() => 0, add);

  await compare('Gatherers.windowFixed(100) over 100k', {
    ours: () => gather(windowFixed, input),
    'hand-written loop': () => {
      const out: ImmutableList<number>[] = [];
      let w: number[] = [];
      for (let i = 0; i < input.length; i++) {
        if (w.push(input[i]) === 100) {
          out.push(new ImmutableList(w, false));
          w = [];
        }
      }
      if (w.length > 0) out.push(new ImmutableList(w, false));
      return out;
    },
  });

  await compare('Gatherers.scan over 100k', {
    ours: () => gather(scan, input),
    'hand-written loop': () => {
      const out: number[] = [];
      let acc = 0;
      for (let i = 0; i < input.length; i++) out.push((acc = add(acc, input[i])));
      return out;
    },
  });

  await compare('Gatherers.fold over 100k', {
    ours: () => gather(fold, input),
    'hand-written loop': () => {
      let acc = 0;
      for (let i = 0; i < input.length; i++) acc = add(acc, input[i]);
      return [acc];
    },
  });
}
