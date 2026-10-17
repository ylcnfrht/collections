import { Comparator } from '../util/Comparator';
import { Collection, SequencedCollection } from './Collection';
import { ListIterator } from './Iterator';

/**
 * List. Removal by position is `removeAt(index)`, because TypeScript
 * can't tell remove(index) from remove(element) on a List<number>.
 */
export interface List<E> extends SequencedCollection<E> {
  add(e: E): boolean;
  add(index: number, e: E): void;
  addAll(c: Collection<E>): boolean;
  addAll(index: number, c: Collection<E>): boolean;
  /** @throws IndexOutOfBoundsException */
  get(index: number): E;
  /** @returns the previous element. @throws IndexOutOfBoundsException */
  set(index: number, e: E): E;
  /** Removes by position. @throws IndexOutOfBoundsException */
  removeAt(index: number): E;
  indexOf(o: unknown): number;
  lastIndexOf(o: unknown): number;
  listIterator(index?: number): ListIterator<E>;
  /** Live view of [fromIndex, toIndex). */
  subList(fromIndex: number, toIndex: number): List<E>;
  replaceAll(operator: (e: E) => E): void;
  /** null = natural ordering. Stable. */
  sort(c?: Comparator<E> | null): void;
  /** Live reverse-ordered view. */
  reversed(): List<E>;
}
