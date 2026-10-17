// Public API. `List`, `Set` and `Map` are both interfaces and factory objects (List.of, Set.of, Map.of).

export * from './exceptions';

export type { Enumeration, Iterator, ListIterator } from './interfaces/Iterator';
export type { WritableArrayLike } from './util/arrays';
export type { Collection, SequencedCollection } from './interfaces/Collection';
export type { Queue, Deque } from './interfaces/Queue';
export type { SequencedSet, SortedSet, NavigableSet } from './interfaces/Set';
export type { MapEntry, SequencedMap, SortedMap, NavigableMap } from './interfaces/Map';
export { List, Set, Map } from './immutable/ImmutableCollections';

export { Comparator, naturalCompare } from './util/Comparator';
export type { Comparable } from './util/Comparator';
export { Objects } from './util/Objects';
export { RANDOM_ACCESS, isRandomAccess } from './util/guards';
export type { RandomAccess } from './util/guards';

export { AbstractCollection } from './abstract/AbstractCollection';
export { AbstractList } from './abstract/AbstractList';
export { AbstractSequentialList } from './abstract/AbstractSequentialList';
export { AbstractQueue } from './abstract/AbstractQueue';
export { AbstractSet } from './abstract/AbstractSet';
export { AbstractMap, SimpleEntry, SimpleImmutableEntry } from './abstract/AbstractMap';

export { ArrayList } from './list/ArrayList';
export { LinkedList } from './list/LinkedList';
export { Vector } from './list/Vector';
export { Stack } from './list/Stack';
export { ArrayDeque } from './queue/ArrayDeque';
export { PriorityQueue } from './queue/PriorityQueue';
export { HashMap } from './map/HashMap';
export { LinkedHashMap } from './map/LinkedHashMap';
export { TreeMap } from './map/TreeMap';
export { IdentityHashMap } from './map/IdentityHashMap';
export { HashSet } from './set/HashSet';
export { LinkedHashSet } from './set/LinkedHashSet';
export { TreeSet } from './set/TreeSet';

export { Collections } from './Collections';
