# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-22

First release.

### Added

- Collection interfaces: `Collection`, `SequencedCollection`, `List`, `Queue`, `Deque`, `Set`, `SequencedSet`,
  `SortedSet`, `NavigableSet`, `Map`, `SequencedMap`, `SortedMap`, `NavigableMap`, with iterators and list iterators.
- Implementations: `ArrayList`, `LinkedList`, `Vector`, `Stack`, `ArrayDeque`, `PriorityQueue`, `HashSet`,
  `LinkedHashSet`, `TreeSet`, `HashMap`, `LinkedHashMap` (with `LinkedHashMap.lru(n)`), `TreeMap`, `IdentityHashMap`.
- Immutable factories `List.of`, `Set.of`, `Map.of`, `Map.ofEntries` and `copyOf`, and the `Collections` utilities
  (sorting, searching, unmodifiable, synchronized and checked wrappers, empty and singleton collections).
- `Stream`, `IntStream`, `LongStream` and `DoubleStream`, `Collectors`, `Gatherers`, `Optional` and its number
  variants, `Spliterator`, `Spliterators` and `StreamSupport`.
- `Comparator` helpers and `Objects`, and `Abstract*` skeleton classes for custom collections.
- Value equality through `equals()`/`hashCode()`, fail-fast iterators, and live views (`subList`, `keySet`,
  `headMap`, `reversed()` and others).
- ESM and CommonJS builds with type definitions, and no runtime dependencies.

[1.0.0]: https://github.com/ylcnfrht/typescript-collection-framework/releases/tag/v1.0.0
