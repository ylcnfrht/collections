import { IndexOutOfBoundsException } from '../exceptions';
import { requireNonNull } from './Objects';

/** Any indexable, length-bearing array: plain arrays and typed arrays alike. */
export interface WritableArrayLike<E> {
  readonly length: number;
  [index: number]: E;
}

/**
 * Backs toArray(generator): asks the generator for an array of exactly `elements.length`
 * and copies the elements in. A plain array may come back shorter (it grows); a fixed-size
 * array that is too short throws IndexOutOfBoundsException.
 */
export function toArrayWith<E, A extends WritableArrayLike<E>>(elements: ArrayLike<E>, generator: (length: number) => A): A {
  requireNonNull(generator);
  const n = elements.length;
  const out = requireNonNull(generator(n));
  if (out.length < n && !Array.isArray(out)) {
    throw new IndexOutOfBoundsException(`generated array length ${out.length} < ${n}`);
  }
  for (let i = 0; i < n; i++) out[i] = elements[i];
  return out;
}
