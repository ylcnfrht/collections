// Assessment of each divergence signature found by the proof run. A divergence is either
//   library          ours behaves differently from the reference (reported, not fixed by the harness), or
//   reference-quirk  the reference's behaviour contradicts its own documented contract and ours follows the contract,
//   intentional      a documented design difference (results equal, only unspecified side effects differ).
// Anything else is "unassessed" and fails the proof run (a new difference, or a harness bug to fix).
import type { Divergence } from './main';

export interface Assessment {
  category: 'library' | 'reference-quirk' | 'intentional' | 'unassessed';
  note: string;
}

const RULES: { sig: RegExp; text?: RegExp; category: Assessment['category']; note: string }[] = [
  {
    sig: /ref=EXC:ArrayIndexOutOfBoundsException ours=EXC:IndexOutOfBoundsException/,
    category: 'library',
    note: 'Vector/Stack List methods and List.of(..) element access throw IndexOutOfBoundsException; the reference throws the subclass ArrayIndexOutOfBoundsException (src/list/Vector.ts uses it only for the legacy methods).',
  },
  {
    sig: /\S+ shuffle result ref=value ours=EXC:UnsupportedOperationException/,
    category: 'library',
    note: 'Collections.shuffle on an unmodifiable list with fewer than 2 elements: the reference makes no swaps and returns; ours writes the (unchanged) elements back through a list iterator for non-RandomAccess lists and throws UnsupportedOperationException (shuffle in src/Collections.ts).',
  },
  {
    sig: /^(MapOf|MapOfPairs|MapCopyOf)\/(keySet|values|entrySet) clear result ref=EXC:UnsupportedOperationException ours=value/,
    category: 'library',
    note: 'Map.of(..).keySet()/values()/entrySet().clear() on an empty map: the reference throws UnsupportedOperationException (the view delegates to the map\'s clear()), ours does nothing.',
  },
  {
    sig: /^(MapOf|MapOfPairs|MapCopyOf)(\/(keySet|values|entrySet))? \S+ result ref=value ours=EXC:UnsupportedOperationException/,
    category: 'library',
    note: 'Map.of/Map.copyOf views (keySet/values/entrySet and the keySet/values/entrySet ops) throw UnsupportedOperationException even when nothing would be removed; the reference\'s views inherit AbstractCollection\'s remove/removeAll/retainAll/removeIf and only throw once an element would actually be removed (returning false otherwise).',
  },
  {
    sig: /^(Empty\w*|Singleton\w*|NCopies)(\/\S+)? \S+ result ref=value ours=EXC:UnsupportedOperationException/,
    category: 'library',
    note: 'Collections.empty*/EMPTY_*/singleton*/nCopies (and their subList/reversed views): ours throws UnsupportedOperationException for every mutator; the reference throws only when the call would change the collection (remove/removeAll/retainAll/removeIf/clear/addAll(empty)/sort of a 0-1 element list/... return false or do nothing).',
  },
  {
    sig: /^(UnmodList|ListOf|ListCopyOf)\/\S+ \S+ result ref=value ours=EXC:UnsupportedOperationException/,
    category: 'library',
    note: 'reversed()/subList() views of unmodifiable lists: ours throws UnsupportedOperationException for every mutator; the reference\'s reversed view only throws when the call would change the list (no-op removeAll/retainAll/remove/addAll(empty) return false).',
  },
  {
    sig: /ref=EXC:(NoSuchElementException|IndexOutOfBoundsException|IllegalStateException|NullPointerException|IllegalArgumentException|ClassCastException) ours=EXC:UnsupportedOperationException/,
    category: 'library',
    note: 'check order on unmodifiable/immutable collections and views: the reference validates the call first (empty collection, index, iterator state, null argument) and throws that exception; ours throws UnsupportedOperationException first.',
  },
  {
    sig: /^(SingletonList|NCopies|EmptyList\w*|ListOf|ListCopyOf|UnmodList)(\/\S+)? (litw|itw) result ref=value ours=value/,
    text: /EXC:IllegalStateException[^\n]*\n[^\n]*EXC:UnsupportedOperationException/,
    category: 'library',
    note: 'check order on immutable list iterators: set()/remove() without a preceding next()/previous() throws IllegalStateException in the reference, UnsupportedOperationException in ours.',
  },
  {
    sig: /\/reversed\S* \S+ result ref=EXC:IndexOutOfBoundsException ours=EXC:IllegalArgumentException/,
    category: 'library',
    note: 'subList(from, to) with from > to on a reversed() list view: the reference throws IndexOutOfBoundsException (Objects.checkFromToIndex), ours IllegalArgumentException (as ArrayList.subList does).',
  },
  {
    sig: /\/reversed\S* (litw|itw) result ref=value ours=value/,
    text: /ours: [^\n]*EXC:IllegalStateException/,
    category: 'reference-quirk',
    note: 'list iterator of a reversed() view: the reference accepts set()/remove() right after add(), which ListIterator specifies as IllegalStateException; ours throws IllegalStateException.',
  },
  {
    sig: /\/reversed\/subList isRA result/,
    category: 'library',
    note: 'reversed().subList(..) is RandomAccess in ours, not in the reference.',
  },
  {
    sig: /\/(subList\/reversed|reversed\/subList) iterCme result ref=EXC:ConcurrentModificationException ours=EXC:NoSuchElementException/,
    category: 'library',
    note: 'an iterator over subList(..).reversed() / reversed().subList(..) is not fail-fast after a structural change through the view: the reference throws ConcurrentModificationException, ours NoSuchElementException.',
  },
  {
    sig: /^SingletonMap(\/entrySet)? \S+ result ref=EXC:UnsupportedOperationException ours=/,
    category: 'library',
    note: 'Collections.singletonMap(..).entrySet().removeIf(..): the reference always throws UnsupportedOperationException (before calling the predicate); ours returns false or calls the predicate first.',
  },
  {
    sig: /sequenced(Values|KeySet|EntrySet) addAll result ref=EXC:UnsupportedOperationException ours=value/,
    category: 'library',
    note: 'sequencedKeySet()/sequencedValues()/sequencedEntrySet().addAll(empty): the reference\'s views always throw UnsupportedOperationException; ours returns false.',
  },
  {
    sig: /sequencedEntrySet add(First|Last) result ref=EXC:ClassCastException ours=EXC:UnsupportedOperationException/,
    category: 'reference-quirk',
    note: 'LinkedHashMap.sequencedEntrySet().addFirst/addLast: the reference fails with ClassCastException inside its view; the documented outcome (and ours) is UnsupportedOperationException.',
  },
  {
    sig: /^LinkedHashMapLru put(First|Last) state/,
    category: 'library',
    note: 'LinkedHashMap.putFirst with a removeEldestEntry override: the reference moves the new entry to the front before asking removeEldestEntry, so it evicts the entry it just inserted; ours evicts the previous eldest.',
  },
  {
    sig: /^(Vector|VectorCap|Stack) capacity result/,
    category: 'intentional',
    note: 'Vector with a capacityIncrement: the reference grows to max(needed, capacity + capacityIncrement) (capacity 5 with 9 elements needed becomes 9); ours replays the growth one element at a time for bulk adds, adding the increment repeatedly (5 becomes 11), and a bulk add followed by removals never records the growth at all (10 instead of 20). This is the documented shortcut in capacity() in src/list/Vector.ts: growth is replayed lazily, one element at a time.',
  },
  {
    sig: /pipe:splwT result ref=value ours=value/,
    text: /IMMUTABLE/,
    category: 'library',
    note: 'spliterator() of a Stream.of/concat/builder stream reports IMMUTABLE in ours; the reference does not.',
  },
  {
    sig: /^NCopies\/subList splw result ref=value ours=value/,
    category: 'library',
    note: 'spliterator() of Collections.nCopies(..).subList(..): the reference does not report ORDERED; ours does.',
  },
  {
    sig: /^(HashMap|HashSet|IdentityHashMap|LinkedHashMap\w*)(\/\S+)? splw result ref=value ours=value/,
    text: /ref : [^\n]*(none|DISTINCT)[,\]][^\n]*\nours: [^\n]*SIZED/,
    category: 'reference-quirk',
    note: 'HashMap/HashSet spliterators of the reference drop SIZED from characteristics() after traversal; the Spliterator contract says characteristics are stable between splits, ours keeps SIZED.',
  },
  {
    sig: /splw result ref=value ours=value/,
    text: /DISTINCT\|SIZED/,
    category: 'reference-quirk',
    note: 'HashMap/HashSet spliterators of the reference drop SIZED from characteristics() after traversal; the Spliterator contract says characteristics are stable between splits, ours keeps SIZED.',
  },
  {
    sig: /^Misc x:(csort|capply|ocmp) result ref=value ours=EXC:NullPointerException/,
    category: 'library',
    note: 'Comparator.thenComparing*(nullsFirst(..)/nullsLast(..), ..): the reference\'s null-friendly comparator keeps handling nulls in the composed comparator (nulls never reach the key extractor); ours passes nulls on to the next comparator.',
  },
  {
    sig: /\/(headSet|tailSet|subSet|headMap|tailMap|subMap|descendingSet|descendingMap)\S* \S+ result ref=EXC:IllegalArgumentException ours=EXC:NullPointerException/,
    category: 'library',
    note: 'null argument outside a range view: the reference reports the range (IllegalArgumentException) before the null (NullPointerException); ours the null first.',
  },
  {
    sig: /^TreeMap\w*(\/\S+)? compute(IfAbsent|IfPresent)? result ref=value ours=EXC:NullPointerException/,
    text: /compute\w* null /,
    category: 'library',
    note: 'compute(null, f) on an empty TreeMap (natural ordering) whose function returns null: the reference never compares the key and returns null; ours rejects the null key first (NullPointerException).',
  },
  {
    sig: /^MapOfPairs init result ref=EXC:IllegalArgumentException ours=EXC:NullPointerException/,
    category: 'library',
    note: 'Map.of(k1, v1, ...) with a duplicate key and a null value: the reference reports the duplicate key (IllegalArgumentException) before the null (NullPointerException); ours the null first.',
  },
  {
    sig: /(subMap|headMap|tailMap)\S* merge result ref=EXC:IllegalArgumentException ours=EXC:NullPointerException/,
    category: 'library',
    note: 'merge(key, null, ..) on a range view with an out-of-range key: the reference reports the range (IllegalArgumentException) before the null value (NullPointerException); ours the null first.',
  },
];

/** Same result, different peek log, through flatMap in pull mode (iterator()/spliterator()). */
function lazierFlatMap(d: Divergence): boolean {
  const line = d.script.lines[d.line] ?? '';
  const strip = (x: string) => (x ?? '').replace(/ LOG\[.*\]$/, '');
  return line.startsWith('pipe ') && /flatMap/.test(line) && strip(d.ref) === strip(d.ours) && d.ref !== d.ours;
}

export function assess(signature: string, d: Divergence): Assessment {
  const line = d.script.lines[d.line] ?? '';
  if (/^pipe .*mapConc/.test(line) && ((d.ref ?? '').split(' ')[0] === (d.ours ?? '').split(' ')[0] || (/null/.test(line) && (d.ref ?? '').startsWith('EXC:'))))
    return {
      category: 'intentional',
      note: 'Gatherers.mapConcurrent: the reference runs the mapper ahead on up to maxConcurrency virtual threads, so an upstream peek observes (and a failing mapper throws for) elements before earlier results reach downstream; ours maps sequentially in order. Results and the exception type are the same; side-effect timing is unspecified.',
    };
  if (lazierFlatMap(d))
    return {
      category: 'intentional',
      note: 'iterator()/spliterator() over flatMap: ours pulls the mapped stream one element at a time (so an infinite mapped stream still yields); the reference pushes the whole mapped stream into its buffer, so an upstream peek sees more elements. Results are equal; how many elements peek observes is unspecified.',
    };
  const text = `${d.script.lines[d.line] ?? ''}\nref : ${d.ref}\nours: ${d.ours}`;
  for (const r of RULES) if (r.sig.test(signature) && (!r.text || r.text.test(text))) return { category: r.category, note: r.note };
  return { category: 'unassessed', note: 'not assessed yet' };
}
