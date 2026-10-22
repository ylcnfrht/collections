// Value side of Gatherer/Integrator (factories, default* sentinels, composition) and the built-in Gatherers.
import { IllegalArgumentException, RuntimeException, UnsupportedOperationException } from '../exceptions';
import { ImmutableList } from '../immutable/ImmutableCollections';
import type { List } from '../interfaces/List';
import { requireNonNull } from '../util/Objects';
import type { Downstream as DownstreamType, Gatherer as GathererType, Integrator as IntegratorType } from './Gatherer';

// interfaces, not type aliases, so documentation tools list their members
/**
 * A custom intermediate operation for `stream.gather(gatherer)`; only `integrator()` is required. The `Gatherer`
 * value holds the factories `Gatherer.of` / `Gatherer.ofSequential` and the `default*` sentinels; built-ins are in
 * {@link Gatherers}.
 */
export interface Gatherer<T, A, R> extends GathererType<T, A, R> {}
/**
 * A gatherer's per-element step `(state, element, downstream) => boolean`: `false` stops the upstream. The
 * `Integrator` value holds `Integrator.of` and `Integrator.ofGreedy`.
 */
export interface Integrator<A, T, R> extends IntegratorType<A, T, R> {}
/** The next stage as a gatherer sees it: `push(element)` emits, `isRejecting()` reports that it wants no more. */
export interface Downstream<T> extends DownstreamType<T> {}

/** What the factories here return: a {@link Gatherer} with every member defined. */
export interface DefinedGatherer<T, A, R> extends GathererType<T, A, R> {
  /** Returns the state initializer; `Gatherer.defaultInitializer()` for a stateless gatherer. */
  initializer(): () => A;
  /** Returns the state combiner; `Gatherer.defaultCombiner()` for a sequential-only gatherer. */
  combiner(): (left: A, right: A) => A;
  /** Returns the finisher; `Gatherer.defaultFinisher()` when there is no finishing action. */
  finisher(): (state: A, downstream: Downstream<R>) => void;
  /**
   * Returns a gatherer that feeds this one's output into `that`; the same as `gather(this).gather(that)`.
   * @throws {@link NullPointerException} if that is null
   */
  andThen<RR>(that: GathererType<R, any, RR>): DefinedGatherer<T, any, RR>;
}

type Initializer<A> = () => A;
type Combiner<A> = (left: A, right: A) => A;
type Finisher<A, R> = (state: A, downstream: Downstream<R>) => void;

// Sentinels: the engine and composition recognise them by identity (===).
const DEFAULT_INITIALIZER: Initializer<any> = () => null;
const DEFAULT_COMBINER: Combiner<any> = () => {
  throw new UnsupportedOperationException('This combiner cannot be used!');
};
const DEFAULT_FINISHER: Finisher<any, any> = () => {};
// combiner of the stateless Gatherer.of overloads: parallel-capable, state is always null
const STATELESS_COMBINER: Combiner<any> = () => null;

function ofGreedy<A, T, R>(fn: (state: A, element: T, downstream: Downstream<R>) => boolean): Integrator<A, T, R> {
  if (fn === null || fn === undefined) return fn as unknown as Integrator<A, T, R>; // like the reference: no check
  return greedy((s: A, e: T, d: Downstream<R>) => fn(s, e, d));
}

/** Marks a fresh closure we own as greedy, skipping ofGreedy's wrapper on hot paths. */
function greedy<F extends (...a: any[]) => boolean>(f: F): F & { readonly greedy: true } {
  (f as { greedy?: boolean }).greedy = true;
  return f as F & { readonly greedy: true };
}

class GathererImpl<T, A, R> implements DefinedGatherer<T, A, R> {
  constructor(
    private readonly init: Initializer<A>,
    private readonly integ: Integrator<A, T, R>,
    private readonly comb: Combiner<A>,
    private readonly fin: Finisher<A, R>
  ) {}
  initializer(): Initializer<A> {
    return this.init;
  }
  integrator(): Integrator<A, T, R> {
    return this.integ;
  }
  combiner(): Combiner<A> {
    return this.comb;
  }
  finisher(): Finisher<A, R> {
    return this.fin;
  }
  andThen<RR>(that: GathererType<R, any, RR>): DefinedGatherer<T, any, RR> {
    return new Composite(this, requireNonNull(that, 'that'));
  }
}

// Contract members other than integrator are optional; a missing one means its default sentinel.
type AnyGatherer = Partial<GathererType<any, any, any>> & Pick<GathererType<any, any, any>, 'integrator'>;
const initOf = (g: AnyGatherer): Initializer<any> => (g.initializer ? g.initializer() : DEFAULT_INITIALIZER);
const combOf = (g: AnyGatherer): Combiner<any> => (g.combiner ? g.combiner() : DEFAULT_COMBINER);
const finOf = (g: AnyGatherer): Finisher<any, any> => (g.finisher ? g.finisher() : DEFAULT_FINISHER);
/** g.andThen(that), or the default composition when g has no andThen. */
function andThenOf(g: AnyGatherer, that: GathererType<any, any, any>): DefinedGatherer<any, any, any> {
  return defined(g.andThen ? g.andThen(that) : new Composite(g as GathererType<any, any, any>, requireNonNull(that, 'that')));
}

/** g itself when ours; a user andThen may return a gatherer with members missing, which gets them filled in. */
function defined(g: GathererType<any, any, any>): DefinedGatherer<any, any, any> {
  return g instanceof GathererImpl || g instanceof Composite ? g : make(initOf(g), g.integrator(), combOf(g), finOf(g));
}
function make<T, A, R>(init: Initializer<A>, integ: Integrator<A, T, R>, comb: Combiner<A>, fin: Finisher<A, R>): DefinedGatherer<T, A, R> {
  return new GathererImpl(requireNonNull(init, 'initializer'), requireNonNull(integ, 'integrator'), requireNonNull(comb, 'combiner'), requireNonNull(fin, 'finisher'));
}

/** this.andThen(that): left's output feeds right; built lazily on first access like the reference. */
class Composite<T, R, RR> implements DefinedGatherer<T, any, RR> {
  private impl: DefinedGatherer<T, any, RR> | null = null;
  constructor(readonly left: GathererType<T, any, R>, readonly right: GathererType<R, any, RR>) {}
  private get(): DefinedGatherer<T, any, RR> {
    return this.impl ?? (this.impl = compose(this.left, this.right));
  }
  initializer(): Initializer<any> {
    return this.get().initializer();
  }
  integrator(): Integrator<any, T, RR> {
    return this.get().integrator();
  }
  combiner(): Combiner<any> {
    return this.get().combiner();
  }
  finisher(): Finisher<any, RR> {
    return this.get().finisher();
  }
  andThen<RRR>(that: GathererType<RR, any, RRR>): DefinedGatherer<T, any, RRR> {
    requireNonNull(that, 'that');
    // re-associate to the right so chains stay flat on the left
    return that instanceof Composite
      ? andThenOf(this.left, andThenOf(andThenOf(this.right, that.left), that.right))
      : andThenOf(this.left, andThenOf(this.right, that));
  }
}

function compose<T, A, R, AA, RR>(left: GathererType<T, A, R>, right: GathererType<R, AA, RR>): DefinedGatherer<T, any, RR> {
  const lInit = initOf(left), lInteg = left.integrator(), lComb = combOf(left), lFin = finOf(left);
  const rInit = initOf(right), rInteg = right.integrator(), rComb = combOf(right), rFin = finOf(right);
  const lStateless = lInit === DEFAULT_INITIALIZER, rStateless = rInit === DEFAULT_INITIALIZER;
  const lGreedy = lInteg.greedy === true, rGreedy = rInteg.greedy === true;
  const sequential = lComb === DEFAULT_COMBINER || rComb === DEFAULT_COMBINER;
  const noFinisher = lFin === DEFAULT_FINISHER && rFin === DEFAULT_FINISHER;

  if (lStateless && rStateless && lGreedy && rGreedy) {
    // no state and no short-circuit signals to track
    const via = (d: Downstream<RR>): Downstream<R> => ({ push: (r) => rInteg(null as AA, r, d), isRejecting: () => false });
    return new GathererImpl<T, null, RR>(
      DEFAULT_INITIALIZER,
      greedy((_: null, e: T, d: Downstream<RR>) => lInteg(null as A, e, via(d))),
      sequential ? DEFAULT_COMBINER : STATELESS_COMBINER,
      noFinisher
        ? DEFAULT_FINISHER
        : (_, d) => {
            if (lFin !== DEFAULT_FINISHER) lFin(null as A, via(d));
            if (rFin !== DEFAULT_FINISHER) rFin(null as AA, d);
          }
    );
  }

  class State {
    constructor(
      readonly leftState: A,
      readonly rightState: AA,
      public leftProceed: boolean,
      public rightProceed: boolean
    ) {}
    // the inner downstream reports isRejecting() false, as the reference's lambda downstream does
    via(d: Downstream<RR>): Downstream<R> {
      return { push: (r) => this.rightIntegrate(r, d), isRejecting: () => false };
    }
    rightIntegrate(r: R, d: Downstream<RR>): boolean {
      return (rGreedy || this.rightProceed) && (rInteg(this.rightState, r, d) || rGreedy || (this.rightProceed = false));
    }
    integrate(e: T, d: Downstream<RR>): boolean {
      // rightProceed is read after left ran, since that can make right short-circuit
      return (lInteg(this.leftState, e, this.via(d)) || lGreedy || (this.leftProceed = false)) && (rGreedy || this.rightProceed);
    }
    joinLeft(o: State): State {
      return new State(
        lStateless ? (null as A) : lComb(this.leftState, o.leftState),
        rStateless ? (null as AA) : rComb(this.rightState, o.rightState),
        this.leftProceed && this.rightProceed,
        o.leftProceed && o.rightProceed
      );
    }
    finish(d: Downstream<RR>): void {
      if (lFin !== DEFAULT_FINISHER) lFin(this.leftState, this.via(d));
      if (rFin !== DEFAULT_FINISHER) rFin(this.rightState, d);
    }
  }
  const integrate = (s: State, e: T, d: Downstream<RR>) => s.integrate(e, d);
  return new GathererImpl<T, State, RR>(
    () => new State(lStateless ? (null as A) : lInit(), rStateless ? (null as AA) : rInit(), true, true),
    lGreedy && rGreedy ? greedy(integrate) : integrate,
    sequential ? DEFAULT_COMBINER : (a, b) => a.joinLeft(b),
    noFinisher ? DEFAULT_FINISHER : (s, d) => s.finish(d)
  );
}

/** Factories for {@link Integrator}. */
export const Integrator = {
  /**
   * Returns the given function as an {@link Integrator} that may stop the upstream by returning `false`. The function
   * is returned unchanged (like the reference, no null check).
   */
  of<A, T, R>(integrator: (state: A, element: T, downstream: Downstream<R>) => boolean): Integrator<A, T, R> {
    return integrator;
  },
  /**
   * Returns a greedy {@link Integrator} wrapping `fn`: it consumes all input and only the downstream may stop it
   * (it returns what `downstream.push` returns, or `true`). Greedy lets the engine skip short-circuit checks, and a
   * greedy integrator is never mistaken for an initializer by `Gatherer.ofSequential`. Like the reference, `null` is
   * returned as-is.
   */
  ofGreedy,
};

/**
 * Factories for {@link Gatherer} and the `default*` sentinels. The stateless overloads use a `null` state.
 *
 * ofSequential(a, b) is resolved at runtime: a function declaring no parameters (and not marked greedy)
 * is read as an initializer, so that call means ofSequential(initializer, integrator); otherwise it means
 * ofSequential(integrator, finisher). An integrator that declares no parameters must use another overload.
 */
export const Gatherer = {
  /** Returns the default initializer: the same instance on every call; it marks a gatherer stateless. Calling it returns `null`. */
  defaultInitializer<A>(): Initializer<A> {
    return DEFAULT_INITIALIZER;
  },
  /**
   * Returns the default combiner: the same instance on every call; it marks a gatherer sequential-only. Calling it
   * throws {@link UnsupportedOperationException}.
   */
  defaultCombiner<A>(): Combiner<A> {
    return DEFAULT_COMBINER;
  },
  /** Returns the default finisher: the same instance on every call; it marks a gatherer as having no finishing action. Calling it does nothing. */
  defaultFinisher<A, R>(): Finisher<A, R> {
    return DEFAULT_FINISHER;
  },

  /**
   * Returns a parallel-capable gatherer: `of(integrator)` and `of(integrator, finisher)` are stateless;
   * `of(initializer, integrator, combiner, finisher)` has state that `combiner` must merge correctly. Evaluation is
   * sequential either way, so this only declares that the gatherer is parallel-safe.
   * @throws {@link NullPointerException} if any argument is null
   */
  of: function of(...args: any[]): DefinedGatherer<any, any, any> {
    if (args.length <= 1) return make(DEFAULT_INITIALIZER, args[0], STATELESS_COMBINER, DEFAULT_FINISHER);
    if (args.length === 2) return make(DEFAULT_INITIALIZER, args[0], STATELESS_COMBINER, args[1]);
    return make(args[0], args[1], args[2], args[3]);
  } as {
    <T, R>(integrator: Integrator<null, T, R>): DefinedGatherer<T, null, R>;
    <T, R>(integrator: Integrator<null, T, R>, finisher: Finisher<null, R>): DefinedGatherer<T, null, R>;
    <T, A, R>(initializer: Initializer<A>, integrator: Integrator<A, T, R>, combiner: Combiner<A>, finisher: Finisher<A, R>): DefinedGatherer<T, A, R>;
  },

  /**
   * Returns a sequential-only gatherer (default combiner): `(integrator)`, `(initializer, integrator)`,
   * `(integrator, finisher)` or `(initializer, integrator, finisher)`. The two-argument forms are told apart at run
   * time by the first function's declared parameter count: with none (and not greedy) it is the initializer.
   * @throws {@link NullPointerException} if any argument is null
   */
  ofSequential: function ofSequential(...args: any[]): DefinedGatherer<any, any, any> {
    switch (args.length) {
      case 0:
      case 1:
        return make(DEFAULT_INITIALIZER, args[0], DEFAULT_COMBINER, DEFAULT_FINISHER);
      case 2: {
        const [a, b] = args;
        return isInitializer(a) ? make(a, b, DEFAULT_COMBINER, DEFAULT_FINISHER) : make(DEFAULT_INITIALIZER, a, DEFAULT_COMBINER, b);
      }
      default:
        return make(args[0], args[1], DEFAULT_COMBINER, args[2]);
    }
  } as {
    <T, R>(integrator: Integrator<null, T, R>): DefinedGatherer<T, null, R>;
    <T, A, R>(initializer: Initializer<A>, integrator: Integrator<A, T, R>): DefinedGatherer<T, A, R>;
    <T, R>(integrator: Integrator<null, T, R>, finisher: Finisher<null, R>): DefinedGatherer<T, null, R>;
    <T, A, R>(initializer: Initializer<A>, integrator: Integrator<A, T, R>, finisher: Finisher<A, R>): DefinedGatherer<T, A, R>;
  },
};

function isInitializer(f: unknown): boolean {
  return typeof f === 'function' && (f === DEFAULT_INITIALIZER || (f.length === 0 && (f as { greedy?: boolean }).greedy !== true));
}

function requireSize(n: number, name: string, zero = 'zero'): void {
  if (!(Number.isInteger(n) && n >= 1)) throw new IllegalArgumentException(`'${name}' must be greater than ${zero}`);
}

// State classes rather than object literals: a literal's hidden class is shared with every same-shaped
// literal in the process, and unrelated code can degrade it (5x slower field stores seen under ts-node).
class Acc<R> {
  constructor(public acc: R) {}
}
class Window<T> {
  w: T[] = [];
  first = true;
}

/** Unmodifiable list over a fresh array, nulls allowed. */
function window<E>(es: E[]): List<E> {
  return new ImmutableList(es, false);
}

/** Built-in {@link Gatherer}s for `stream.gather`. All are sequential (default combiner). */
export const Gatherers = {
  /**
   * Returns a gatherer that folds the elements, in order, into one value starting from `initial()` and emits it at
   * the end of input; an empty stream emits `initial()`.
   * @throws {@link NullPointerException} if initial or folder is null
   */
  fold<T, R>(initial: () => R, folder: (acc: R, element: T) => R): DefinedGatherer<T, Acc<R>, R> {
    requireNonNull(initial, "'initial' must not be null");
    requireNonNull(folder, "'folder' must not be null");
    return Gatherer.ofSequential(
      () => new Acc(initial()),
      greedy((s: Acc<R>, e: T) => {
        s.acc = folder(s.acc, e);
        return true;
      }),
      (s, d: Downstream<R>) => {
        d.push(s.acc);
      }
    );
  },

  /**
   * Returns a gatherer that emits every running accumulation: `scanner(current, element)` for each element, starting
   * from `initial()` (which itself is not emitted).
   * @throws {@link NullPointerException} if initial or scanner is null
   */
  scan<T, R>(initial: () => R, scanner: (acc: R, element: T) => R): DefinedGatherer<T, Acc<R>, R> {
    requireNonNull(initial, "'initial' must not be null");
    requireNonNull(scanner, "'scanner' must not be null");
    return Gatherer.ofSequential(
      () => new Acc(initial()),
      greedy((s: Acc<R>, e: T, d: Downstream<R>) => d.push((s.acc = scanner(s.acc, e))))
    );
  },

  /**
   * Returns a gatherer that groups elements into consecutive unmodifiable lists of `windowSize`; the last window may
   * be shorter. No window for empty input.
   * @throws {@link IllegalArgumentException} if windowSize is less than 1 (or not an integer)
   */
  windowFixed<T>(windowSize: number): DefinedGatherer<T, Window<T>, List<T>> {
    requireSize(windowSize, 'windowSize');
    return Gatherer.ofSequential(
      () => new Window<T>(),
      greedy((s: Window<T>, e: T, d: Downstream<List<T>>) => {
        const w = s.w;
        if (w.push(e) < windowSize) return true;
        s.w = [];
        return d.push(window(w));
      }),
      (s, d) => {
        if (s.w.length > 0 && !d.isRejecting()) {
          const w = s.w;
          s.w = [];
          d.push(window(w));
        }
      }
    );
  },

  /**
   * Returns a gatherer of sliding unmodifiable windows of `windowSize`, each dropping the oldest element of the
   * previous one. With fewer elements than `windowSize`, one window holding all of them; none for empty input.
   * @throws {@link IllegalArgumentException} if windowSize is less than 1 (or not an integer)
   */
  windowSliding<T>(windowSize: number): DefinedGatherer<T, Window<T>, List<T>> {
    requireSize(windowSize, 'windowSize');
    return Gatherer.ofSequential(
      () => new Window<T>(),
      greedy((s: Window<T>, e: T, d: Downstream<List<T>>) => {
        const w = s.w;
        if (w.push(e) < windowSize) return true;
        s.w = w.slice(1);
        s.first = false;
        return d.push(window(w));
      }),
      (s, d) => {
        if (s.first && s.w.length > 0 && !d.isRejecting()) {
          const w = s.w;
          s.w = [];
          d.push(window(w));
        }
      }
    );
  },

  /**
   * Returns a gatherer that maps each element, preserving encounter order. The mapper runs synchronously, one
   * element at a time; maxConcurrency is validated but has no further effect. A mapper exception is rethrown as-is
   * when it is a RuntimeException, otherwise wrapped in a RuntimeException with it as `cause`. The mapper is not
   * called once the downstream is rejecting. Promises are not awaited.
   * @throws {@link IllegalArgumentException} if maxConcurrency is less than 1 (or not an integer)
   * @throws {@link NullPointerException} if mapper is null
   */
  mapConcurrent<T, R>(maxConcurrency: number, mapper: (element: T) => R): DefinedGatherer<T, null, R> {
    requireSize(maxConcurrency, 'maxConcurrency', '0');
    requireNonNull(mapper, "'mapper' must not be null");
    return Gatherer.ofSequential(
      greedy((_: null, e: T, d: Downstream<R>) => {
        if (d.isRejecting()) return false;
        let r: R;
        try {
          r = mapper(e);
        } catch (x) {
          if (x instanceof RuntimeException) throw x;
          const wrapped = new RuntimeException(x instanceof Error ? `${x.name}: ${x.message}` : String(x));
          (wrapped as { cause?: unknown }).cause = x;
          throw wrapped;
        }
        return d.push(r);
      })
    );
  },
};
