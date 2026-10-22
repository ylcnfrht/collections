// `name` is set explicitly (not from constructor.name) so it survives minification.

/**
 * Base class of every exception this library throws; a plain `Error` subclass, so `instanceof Error` holds.
 * Catch it to handle any library failure in one place.
 */
export class RuntimeException extends Error {
  /** Always `'RuntimeException'`; set explicitly so it survives minification. */
  override name = 'RuntimeException';
}

/**
 * Thrown when an index is outside the valid range, e.g. `get(index)` on a list with
 * `index < 0 || index >= size()`, or an invalid `fromIndex`/`toIndex` pair.
 */
export class IndexOutOfBoundsException extends RuntimeException {
  /** Always `'IndexOutOfBoundsException'`. */
  override name = 'IndexOutOfBoundsException';
}

/**
 * An {@link IndexOutOfBoundsException} for array-backed legacy APIs: thrown by `Vector`'s index methods,
 * by array spliterators with a bad range, and by `List.of(...)` lists built from an array view.
 */
export class ArrayIndexOutOfBoundsException extends IndexOutOfBoundsException {
  /** Always `'ArrayIndexOutOfBoundsException'`. */
  override name = 'ArrayIndexOutOfBoundsException';
}

/**
 * Thrown when a requested element does not exist: `next()` on an exhausted iterator, `getFirst()`/`element()`
 * on an empty collection, `first()`/`firstKey()` on an empty sorted set or map, `Optional.get()` on an empty optional.
 */
export class NoSuchElementException extends RuntimeException {
  /** Always `'NoSuchElementException'`. */
  override name = 'NoSuchElementException';
}

/** Thrown by `Stack.peek()` and `Stack.pop()` when the stack is empty. */
export class EmptyStackException extends RuntimeException {
  /** Always `'EmptyStackException'`. */
  override name = 'EmptyStackException';
}

/**
 * Thrown when `null` or `undefined` is passed where a value is required: a `null` collection or function argument,
 * a `null` element in a collection that rejects nulls (`ArrayDeque`, `PriorityQueue`, the immutable `List.of`/`Set.of`/
 * `Map.of` collections), or a `null` key in a `TreeMap` that uses natural ordering.
 */
export class NullPointerException extends RuntimeException {
  /** Always `'NullPointerException'`. */
  override name = 'NullPointerException';
}

/**
 * Thrown when an argument has an invalid value: a negative capacity, a load factor that is not positive,
 * `fromIndex > toIndex` in a range method, a duplicate element passed to `Set.of`, or a duplicate key passed to `Map.of`.
 */
export class IllegalArgumentException extends RuntimeException {
  /** Always `'IllegalArgumentException'`. */
  override name = 'IllegalArgumentException';
}

/**
 * Thrown when a method is called at the wrong time: `Iterator.remove()` before `next()` or twice in a row,
 * `add()` on a full bounded queue, or reusing a stream that was already consumed.
 */
export class IllegalStateException extends RuntimeException {
  /** Always `'IllegalStateException'`. */
  override name = 'IllegalStateException';
}

/**
 * Thrown when a collection does not support the requested operation: any mutator on an unmodifiable view or an
 * immutable `List.of`/`Set.of`/`Map.of` collection, `add` on a fixed-size list, or the optional methods that an
 * `Abstract*` skeleton leaves unimplemented.
 */
export class UnsupportedOperationException extends RuntimeException {
  /** Always `'UnsupportedOperationException'`. */
  override name = 'UnsupportedOperationException';
}

/**
 * Thrown by fail-fast iterators, views and bulk operations when the backing collection was structurally modified
 * other than through the iterator itself. Detection is best effort; do not rely on it for correctness.
 */
export class ConcurrentModificationException extends RuntimeException {
  /** Always `'ConcurrentModificationException'`. */
  override name = 'ConcurrentModificationException';
}

/**
 * Thrown when a value has the wrong type for the operation: comparing values that are not mutually comparable
 * under natural ordering (e.g. a number and a string), or inserting a value that fails a `Collections.checked*`
 * wrapper's type check.
 */
export class ClassCastException extends RuntimeException {
  /** Always `'ClassCastException'`. */
  override name = 'ClassCastException';
}
