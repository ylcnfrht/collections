// Conformance: Collectors and Collector.
import {
  ArrayList,
  Collections,
  Collector,
  Collectors,
  Comparator,
  DoubleSummaryStatistics,
  HashMap,
  HashSet,
  IntSummaryStatistics,
  List,
  LongSummaryStatistics,
  Optional,
  Stream,
  TreeMap,
  TreeSet,
} from '../../src';
import { expectThrows, Point } from '../helpers';

const NPE = 'NullPointerException';
const ISE = 'IllegalStateException';
const UOE = 'UnsupportedOperationException';

interface Person {
  name: string;
  last: string;
  city: string;
  state: string;
  dept: string;
  salary: number;
  height: number;
}
const P = (name: string, last: string, city: string, state: string, dept: string, salary: number, height: number): Person => ({
  name,
  last,
  city,
  state,
  dept,
  salary,
  height,
});
const people = List.of(
  P('Ann', 'Smith', 'Austin', 'TX', 'eng', 3000, 170),
  P('Bob', 'Jones', 'Dallas', 'TX', 'ops', 1500, 180),
  P('Cid', 'Brown', 'Austin', 'TX', 'eng', 2500, 165),
  P('Dee', 'Smithers', 'Albany', 'NY', 'ops', 1000, 175),
  P('Eve', 'Li', 'Albany', 'NY', 'hr', 4000, 160),
);
const names = (l: { toArray(): Person[] } | null) => (l === null ? null : l.toArray().map((p) => p.name));

describe('Collectors class examples', () => {
  // List<String> list = people.stream().map(Person::getName).collect(Collectors.toList());
  it('accumulate names into a List', () =>
    expect(people.stream().map((p) => p.name).collect(Collectors.toList()).toArray()).toEqual(['Ann', 'Bob', 'Cid', 'Dee', 'Eve']));
  // Set<String> set = people.stream().map(Person::getName).collect(Collectors.toCollection(TreeSet::new));
  it('accumulate names into a TreeSet', () => {
    const set = people.stream().map((p) => p.last).collect(Collectors.toCollection(() => new TreeSet<string>()));
    expect(set).toBeInstanceOf(TreeSet);
    expect(set.toArray()).toEqual(['Brown', 'Jones', 'Li', 'Smith', 'Smithers']);
  });
  // String joined = things.stream().map(Object::toString).collect(Collectors.joining(", "));
  it('convert elements to strings and join with commas', () =>
    expect(Stream.of<number | string>(1, 'b', 2.5).map(String).collect(Collectors.joining(', '))).toBe('1, b, 2.5'));
  // int total = employees.stream().collect(Collectors.summingInt(Employee::getSalary));
  it('compute sum of salaries', () => expect(people.stream().collect(Collectors.summingInt((p) => p.salary))).toBe(12000));
  // Map<Department, List<Employee>> byDept = employees.stream().collect(Collectors.groupingBy(Employee::getDepartment));
  it('group employees by department', () => {
    const byDept = people.stream().collect(Collectors.groupingBy((p) => p.dept));
    expect(byDept.size()).toBe(3);
    expect(names(byDept.get('eng'))).toEqual(['Ann', 'Cid']);
    expect(names(byDept.get('ops'))).toEqual(['Bob', 'Dee']);
    expect(names(byDept.get('hr'))).toEqual(['Eve']);
  });
  // Map<Department, Integer> totalByDept = ... groupingBy(Employee::getDepartment, Collectors.summingInt(Employee::getSalary));
  it('compute sum of salaries by department', () => {
    const totalByDept = people.stream().collect(Collectors.groupingBy((p) => p.dept, Collectors.summingInt((p) => p.salary)));
    expect([totalByDept.get('eng'), totalByDept.get('ops'), totalByDept.get('hr')]).toEqual([5500, 2500, 4000]);
  });
  // Map<Boolean, List<Student>> passingFailing = students.stream().collect(Collectors.partitioningBy(s -> s.getGrade() >= PASS_THRESHOLD));
  it('partition students into passing and failing', () => {
    const grades = List.of(90, 40, 75, 55);
    const pf = grades.stream().collect(Collectors.partitioningBy((g) => g >= 60));
    expect(pf.get(true)!.toArray()).toEqual([90, 75]);
    expect(pf.get(false)!.toArray()).toEqual([40, 55]);
  });
});

describe('toList / toSet / toCollection / unmodifiable', () => {
  it('toList keeps encounter order and nulls', () => expect(Stream.of(2, null, 1).collect(Collectors.toList()).toArray()).toEqual([2, null, 1]));
  it('toList of empty is empty', () => expect(Stream.empty().collect(Collectors.toList()).isEmpty()).toBe(true));
  it('toList gives an ArrayList (library convention)', () => expect(Stream.of(1).collect(Collectors.toList())).toBeInstanceOf(ArrayList));
  it('toSet removes duplicates by equals', () => {
    const s = Stream.of(new Point(1, 1), new Point(1, 1), new Point(2, 2)).collect(Collectors.toSet());
    expect(s.size()).toBe(2);
    expect(s.contains(new Point(2, 2))).toBe(true);
  });
  it('toSet gives a HashSet (library convention)', () => expect(Stream.of(1).collect(Collectors.toSet())).toBeInstanceOf(HashSet));
  it('toSet allows null', () => expect(Stream.of(null, 1).collect(Collectors.toSet()).contains(null)).toBe(true));
  it('toCollection uses the supplied collection', () => {
    const c = Stream.of(3, 1, 2).collect(Collectors.toCollection(() => new TreeSet<number>(Comparator.reverseOrder())));
    expect(c.toArray()).toEqual([3, 2, 1]);
  });
  it('toCollection into a fresh ArrayList', () => expect(Stream.of('a').collect(Collectors.toCollection(() => new ArrayList<string>())).toArray()).toEqual(['a']));
  // toUnmodifiableList: "Returns a Collector that accumulates the input elements into an unmodifiable List in encounter order."
  it('toUnmodifiableList keeps order', () => expect(Stream.of(3, 1).collect(Collectors.toUnmodifiableList()).toArray()).toEqual([3, 1]));
  it('toUnmodifiableList result rejects mutation', () => expectThrows(() => Stream.of(1).collect(Collectors.toUnmodifiableList()).add(2), UOE));
  // "Returned Collector disallows null values and will throw NullPointerException if it is presented with a null value."
  it('toUnmodifiableList rejects null', () => expectThrows(() => Stream.of(1, null).collect(Collectors.toUnmodifiableList()), NPE));
  it('toUnmodifiableSet removes duplicates', () => expect(Stream.of(1, 1, 2).collect(Collectors.toUnmodifiableSet()).size()).toBe(2));
  it('toUnmodifiableSet result rejects mutation', () => expectThrows(() => Stream.of(1).collect(Collectors.toUnmodifiableSet()).add(2), UOE));
  it('toUnmodifiableSet rejects null', () => expectThrows(() => Stream.of(null).collect(Collectors.toUnmodifiableSet()), NPE));
  // "If the input contains duplicate elements, an arbitrary element of the duplicates is preserved."
  it('toUnmodifiableSet keeps one of equal elements', () => {
    const a = new Point(0, 0);
    const b = new Point(0, 0);
    const s = Stream.of(a, b).collect(Collectors.toUnmodifiableSet());
    expect(s.size()).toBe(1);
    const kept = s.iterator().next();
    expect(kept === a || kept === b).toBe(true);
  });
});

describe('joining', () => {
  it('joining() concatenates', () => expect(Stream.of('a', 'b', 'c').collect(Collectors.joining())).toBe('abc'));
  it('joining() of empty is ""', () => expect(Stream.empty<string>().collect(Collectors.joining())).toBe(''));
  it('joining(delimiter)', () => expect(Stream.of('a', 'b').collect(Collectors.joining('-'))).toBe('a-b'));
  it('joining(delimiter) of a single element has no delimiter', () => expect(Stream.of('a').collect(Collectors.joining('-'))).toBe('a'));
  it('joining(delimiter, prefix, suffix)', () => expect(Stream.of('a', 'b').collect(Collectors.joining(', ', '[', ']'))).toBe('[a, b]'));
  it('joining(delimiter, prefix, suffix) of empty is prefix+suffix', () =>
    expect(Stream.empty<string>().collect(Collectors.joining(', ', '{', '}'))).toBe('{}'));
  it('joining keeps encounter order on a parallel stream', () =>
    expect(Stream.of('x', 'y', 'z').parallel().collect(Collectors.joining('/'))).toBe('x/y/z'));
  it('joining empty strings keeps delimiters', () => expect(Stream.of('', '').collect(Collectors.joining(','))).toBe(','));
});

describe('counting / summing / averaging', () => {
  it('counting', () => expect(Stream.of('a', 'b').collect(Collectors.counting())).toBe(2));
  // counting: "If no elements are present, the result is 0."
  it('counting of empty is 0', () => expect(Stream.empty().collect(Collectors.counting())).toBe(0));
  it('summingInt', () => expect(Stream.of('a', 'bb').collect(Collectors.summingInt((s) => s.length))).toBe(3));
  it('summingInt of empty is 0', () => expect(Stream.empty<string>().collect(Collectors.summingInt((s) => s.length))).toBe(0));
  it('summingLong', () => expect(Stream.of(2147483647, 2147483647).collect(Collectors.summingLong((x) => x))).toBe(4294967294));
  it('summingDouble', () => expect(Stream.of(0.5, 0.25).collect(Collectors.summingDouble((x) => x))).toBe(0.75));
  // summingDouble: "If any recorded value is a NaN or the sum is at any point a NaN then the sum will be NaN."
  it('summingDouble with NaN is NaN', () => expect(Stream.of(1, NaN).collect(Collectors.summingDouble((x) => x))).toBeNaN());
  it('summingDouble of empty is 0', () => expect(Stream.empty<number>().collect(Collectors.summingDouble((x) => x))).toBe(0));
  it('averagingInt', () => expect(Stream.of(1, 2).collect(Collectors.averagingInt((x) => x))).toBe(1.5));
  // averagingInt: "If no elements are present, the result is 0."
  it('averagingInt of empty is 0', () => expect(Stream.empty<number>().collect(Collectors.averagingInt((x) => x))).toBe(0));
  it('averagingLong', () => expect(Stream.of(10, 20, 60).collect(Collectors.averagingLong((x) => x))).toBe(30));
  it('averagingLong of empty is 0', () => expect(Stream.empty<number>().collect(Collectors.averagingLong((x) => x))).toBe(0));
  it('averagingDouble', () => expect(Stream.of(0.5, 1.5).collect(Collectors.averagingDouble((x) => x))).toBe(1));
  it('averagingDouble of empty is 0', () => expect(Stream.empty<number>().collect(Collectors.averagingDouble((x) => x))).toBe(0));
  // averagingDouble: "If any recorded value is a NaN or the sum is at any point a NaN then the average will be NaN."
  it('averagingDouble with NaN is NaN', () => expect(Stream.of(NaN, 1).collect(Collectors.averagingDouble((x) => x))).toBeNaN());
});

describe('minBy / maxBy / reducing', () => {
  const cmp = (a: number, b: number) => a - b;
  it('minBy', () => expect(Stream.of(3, 1, 2).collect(Collectors.minBy(cmp)).get()).toBe(1));
  it('maxBy', () => expect(Stream.of(3, 1, 2).collect(Collectors.maxBy(cmp)).get()).toBe(3));
  it('minBy of empty is Optional.empty', () => expect(Stream.empty<number>().collect(Collectors.minBy(cmp)).equals(Optional.empty())).toBe(true));
  it('maxBy of empty is Optional.empty', () => expect(Stream.empty<number>().collect(Collectors.maxBy(cmp)).isPresent()).toBe(false));
  it('reducing(identity, op)', () => expect(Stream.of(1, 2, 3).collect(Collectors.reducing(0, (a: number, b: number) => a + b))).toBe(6));
  it('reducing(identity, op) of empty is identity', () =>
    expect(Stream.empty<number>().collect(Collectors.reducing(10, (a: number, b: number) => a + b))).toBe(10));
  it('reducing(op) gives Optional', () => expect(Stream.of(2, 5).collect(Collectors.reducing((a: number, b: number) => a * b)).get()).toBe(10));
  it('reducing(op) of empty is Optional.empty', () =>
    expect(Stream.empty<number>().collect(Collectors.reducing((a: number, b: number) => a + b)).isPresent()).toBe(false));
  it('reducing(identity, mapper, op)', () =>
    expect(Stream.of('a', 'bbb').collect(Collectors.reducing(0, (s: string) => s.length, (a: number, b: number) => a + b))).toBe(4));
  // doc example: groupingBy(Person::getCity, reducing(BinaryOperator.maxBy(byHeight)))
  it('doc example: tallest by city', () => {
    const byHeight = Comparator.comparingInt((p: Person) => p.height);
    const tallest = people.stream().collect(Collectors.groupingBy((p) => p.city, Collectors.reducing((a: Person, b: Person) => Comparator.max(byHeight, a, b))));
    expect(tallest.get('Austin')!.get().name).toBe('Ann');
    expect(tallest.get('Albany')!.get().name).toBe('Dee');
  });
  // doc example: groupingBy(Person::getCity, reducing("", Person::getLastName, BinaryOperator.maxBy(byLength)))
  it('doc example: longest last name by city', () => {
    const byLength = Comparator.comparingInt((s: string) => s.length);
    const longest = people
      .stream()
      .collect(Collectors.groupingBy((p) => p.city, Collectors.reducing('', (p: Person) => p.last, (a: string, b: string) => Comparator.max(byLength, a, b))));
    expect(longest.get('Albany')).toBe('Smithers');
    expect(longest.get('Austin')).toBe('Smith');
  });
});

describe('mapping / filtering / flatMapping / collectingAndThen', () => {
  // doc example: groupingBy(Person::getCity, mapping(Person::getLastName, toSet()))
  it('mapping: last names by city', () => {
    const m = people.stream().collect(Collectors.groupingBy((p) => p.city, Collectors.mapping((p: Person) => p.last, Collectors.toSet())));
    expect(m.get('Austin')!.size()).toBe(2);
    expect(m.get('Austin')!.contains('Brown')).toBe(true);
  });
  it('mapping at top level', () => expect(Stream.of(1, 2).collect(Collectors.mapping((x: number) => x * 3, Collectors.toList())).toArray()).toEqual([3, 6]));
  // doc example: groupingBy(Employee::getDepartment, filtering(e -> e.getSalary() > 2000, toSet()))
  // "If there are no employees in a department ... an empty Set" — the key is kept with an empty result.
  it('filtering: well-paid employees by department keeps empty departments', () => {
    const m = people.stream().collect(Collectors.groupingBy((p) => p.dept, Collectors.filtering((p: Person) => p.salary > 2000, Collectors.toSet())));
    expect(m.get('eng')!.size()).toBe(2);
    expect(m.containsKey('ops')).toBe(true);
    expect(m.get('ops')!.isEmpty()).toBe(true);
  });
  it('filtering at top level', () => expect(Stream.of(1, 2, 3).collect(Collectors.filtering((x: number) => x > 1, Collectors.counting()))).toBe(2));
  // doc example: groupingBy(Order::getCustomerName, flatMapping(order -> order.getLineItems().stream(), toSet()))
  it('flatMapping: line items by customer', () => {
    const orders = List.of({ c: 'x', items: List.of(1, 2) }, { c: 'y', items: List.of(3) }, { c: 'x', items: List.of(2, 4) });
    const m = orders.stream().collect(Collectors.groupingBy((o) => o.c, Collectors.flatMapping((o: { c: string; items: List<number> }) => o.items.stream(), Collectors.toSet())));
    expect(new TreeSet(m.get('x')!).toArray()).toEqual([1, 2, 4]);
    expect(m.get('y')!.toArray()).toEqual([3]);
  });
  // flatMapping: "Each mapped stream is closed after its contents have been placed downstream."
  it('flatMapping closes each mapped stream', () => {
    const log: number[] = [];
    Stream.of(1, 2).collect(Collectors.flatMapping((x: number) => Stream.of(x).onClose(() => log.push(x)), Collectors.toList()));
    expect(log).toEqual([1, 2]);
  });
  // "(If a mapped stream is null an empty stream is used, instead.)"
  it('flatMapping treats a null stream as empty', () =>
    expect(Stream.of(1, 2).collect(Collectors.flatMapping((x: number) => (x === 1 ? null : Stream.of(x)), Collectors.toList())).toArray()).toEqual([2]));
  // doc example: collectingAndThen(toList(), Collections::unmodifiableList)
  it('collectingAndThen with unmodifiableList', () => {
    const l = Stream.of('a', 'b').collect(Collectors.collectingAndThen(Collectors.toList<string>(), (x) => Collections.unmodifiableList(x)));
    expect(l.toArray()).toEqual(['a', 'b']);
    expectThrows(() => l.add('c'), UOE);
  });
  it('collectingAndThen applies the finisher once', () => {
    let calls = 0;
    expect(Stream.of(1, 2).collect(Collectors.collectingAndThen(Collectors.counting(), (n: number) => (calls++, n * 10)))).toBe(20);
    expect(calls).toBe(1);
  });
});

describe('groupingBy', () => {
  it('groups preserving encounter order within each group', () => {
    const m = Stream.of('apple', 'avocado', 'banana', 'apricot').collect(Collectors.groupingBy((s) => s[0]));
    expect(m.get('a')!.toArray()).toEqual(['apple', 'avocado', 'apricot']);
    expect(m.get('b')!.toArray()).toEqual(['banana']);
  });
  it('empty stream gives an empty map', () => expect(Stream.empty<string>().collect(Collectors.groupingBy((s) => s)).isEmpty()).toBe(true));
  it('gives a HashMap (library convention)', () => expect(Stream.of(1).collect(Collectors.groupingBy((x) => x))).toBeInstanceOf(HashMap));
  it('groups by equals/hashCode of keys', () => {
    const m = Stream.of(1, 2, 3, 4).collect(Collectors.groupingBy((x) => new Point(x % 2, 0)));
    expect(m.size()).toBe(2);
    expect(m.get(new Point(0, 0))!.toArray()).toEqual([2, 4]);
  });
  it('a null classifier result throws NullPointerException', () =>
    expectThrows(() => Stream.of(1, 2).collect(Collectors.groupingBy((x) => (x === 2 ? null : 'k'))), NPE));
  it('groupingBy(classifier, counting())', () => {
    const m = Stream.of('a', 'b', 'a').collect(Collectors.groupingBy((s) => s, Collectors.counting()));
    expect([m.get('a'), m.get('b')]).toEqual([2, 1]);
  });
  // doc example: groupingBy(Person::getCity, TreeMap::new, mapping(Person::getLastName, toSet()))
  it('groupingBy(classifier, mapFactory, downstream) uses the map factory', () => {
    const m = people.stream().collect(Collectors.groupingBy((p) => p.city, () => new TreeMap<string, number>(), Collectors.counting()));
    expect(m).toBeInstanceOf(TreeMap);
    expect(m.toString()).toBe('{Albany=2, Austin=2, Dallas=1}');
  });
  // Stream.collect doc example: groupingBy(Person::getState, groupingBy(Person::getCity))
  it('nested grouping: people by state and city', () => {
    const m = people.stream().collect(Collectors.groupingBy((p) => p.state, Collectors.groupingBy((p: Person) => p.city)));
    expect(names(m.get('TX')!.get('Austin'))).toEqual(['Ann', 'Cid']);
    expect(names(m.get('NY')!.get('Albany'))).toEqual(['Dee', 'Eve']);
    expect(m.get('TX')!.size()).toBe(2);
  });
  it('package example: salaries by department with a reusable summing collector', () => {
    const summingSalaries = Collectors.summingInt((p: Person) => p.salary);
    const m = people.stream().collect(Collectors.groupingBy((p) => p.dept, summingSalaries));
    expect(m.get('hr')).toBe(4000);
  });
  it('same result on a parallel stream', () => {
    const m = people.parallelStream().collect(Collectors.groupingBy((p) => p.dept));
    expect(names(m.get('eng'))).toEqual(['Ann', 'Cid']);
  });
  // package example: txns.parallelStream().unordered().collect(groupingByConcurrent(Transaction::getBuyer))
  it('groupingByConcurrent groups the same elements', () => {
    const m = people.parallelStream().unordered().collect(Collectors.groupingByConcurrent((p) => p.state));
    expect(new TreeSet(m.get('TX')!.stream().map((p) => p.name).toList()).toArray()).toEqual(['Ann', 'Bob', 'Cid']);
  });
  it('groupingByConcurrent with downstream', () => {
    const m = Stream.of(1, 2, 3).collect(Collectors.groupingByConcurrent((x) => x % 2, Collectors.summingInt((x: number) => x)));
    expect([m.get(0), m.get(1)]).toEqual([2, 4]);
  });
  it('groupingByConcurrent with a map factory', () => {
    const m = Stream.of('b', 'a').collect(Collectors.groupingByConcurrent((s) => s, () => new TreeMap<string, number>(), Collectors.counting()));
    expect(m.toString()).toBe('{a=1, b=1}');
  });
  it('groupingByConcurrent null key throws NullPointerException', () =>
    expectThrows(() => Stream.of(1).collect(Collectors.groupingByConcurrent(() => null)), NPE));
});

describe('partitioningBy', () => {
  // "The returned Map always contains mappings for both false and true keys."
  it('has both keys for an empty stream', () => {
    const m = Stream.empty<number>().collect(Collectors.partitioningBy((x) => x > 0));
    expect(m.size()).toBe(2);
    expect(m.get(true)!.isEmpty()).toBe(true);
    expect(m.get(false)!.isEmpty()).toBe(true);
  });
  it('has both keys when all elements go one way', () => {
    const m = Stream.of(1, 2).collect(Collectors.partitioningBy((x) => x > 0));
    expect(m.containsKey(false)).toBe(true);
    expect(m.get(false)!.size()).toBe(0);
    expect(m.get(true)!.toArray()).toEqual([1, 2]);
  });
  it('with a downstream collector', () => {
    const m = Stream.of(1, 2, 3, 4, 5).collect(Collectors.partitioningBy((x) => x % 2 === 0, Collectors.counting()));
    expect([m.get(true), m.get(false)]).toEqual([2, 3]);
  });
  it('downstream result exists for the empty partition', () => {
    const m = Stream.of(1).collect(Collectors.partitioningBy((x) => x > 5, Collectors.summingInt((x: number) => x)));
    expect([m.get(true), m.get(false)]).toEqual([0, 1]);
  });
  it('keeps encounter order inside partitions', () => {
    const m = Stream.of(5, 1, 4, 2).collect(Collectors.partitioningBy((x) => x > 2));
    expect(m.get(true)!.toArray()).toEqual([5, 4]);
    expect(m.get(false)!.toArray()).toEqual([1, 2]);
  });
});

describe('toMap', () => {
  // doc example: toMap(Student::getId, Function.identity())
  it('toMap(keyMapper, valueMapper)', () => {
    const m = people.stream().collect(Collectors.toMap((p) => p.name, (p) => p.salary));
    expect(m.size()).toBe(5);
    expect(m.get('Bob')).toBe(1500);
  });
  it('gives a HashMap (library convention)', () => expect(Stream.of(1).collect(Collectors.toMap((x) => x, (x) => x))).toBeInstanceOf(HashMap));
  // "If the mapped keys contain duplicates (according to Object.equals(Object)), an IllegalStateException is thrown"
  it('duplicate keys throw IllegalStateException', () => expectThrows(() => Stream.of('a', 'bb', 'cc').collect(Collectors.toMap((s) => s.length, (s) => s)), ISE));
  it('duplicate key message names the key and both values', () => {
    let msg = '';
    try {
      Stream.of('a', 'bb', 'cc').collect(Collectors.toMap((s) => s.length, (s) => s));
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe('Duplicate key 2 (attempted merging values bb and cc)');
  });
  it('duplicates by equals (not identity) are detected', () =>
    expectThrows(() => Stream.of(new Point(1, 1), new Point(1, 1)).collect(Collectors.toMap((p) => p, () => 1)), ISE));
  it('empty stream gives an empty map', () => expect(Stream.empty<string>().collect(Collectors.toMap((s) => s, (s) => s)).size()).toBe(0));
  // doc example: toMap(Person::getName, Person::getAddress, (s, a) -> s + ", " + a)
  it('toMap with merge function concatenates', () => {
    const m = Stream.of(['x', 'a'], ['y', 'b'], ['x', 'c']).collect(
      Collectors.toMap(
        (e) => e[0],
        (e) => e[1],
        (s, a) => s + ', ' + a,
      ),
    );
    expect(m.get('x')).toBe('a, c');
    expect(m.get('y')).toBe('b');
  });
  // doc example: toMap(Function.identity(), Person::getAddress? ... (a, b) -> a) keeps the first
  it('merge function (a, b) -> a keeps the first value', () =>
    expect(Stream.of('aa', 'bb').collect(Collectors.toMap((s) => s.length, (s) => s, (a) => a)).get(2)).toBe('aa'));
  it('toMap with a map factory', () => {
    const m = Stream.of('b', 'a', 'c').collect(Collectors.toMap((s) => s, (s) => s.charCodeAt(0), (a, b) => a + b, () => new TreeMap<string, number>()));
    expect(m).toBeInstanceOf(TreeMap);
    expect(m.toString()).toBe('{a=97, b=98, c=99}');
  });
  it('toConcurrentMap', () => {
    const m = Stream.of('a', 'bb').collect(Collectors.toConcurrentMap((s) => s, (s) => s.length));
    expect([m.get('a'), m.get('bb')]).toEqual([1, 2]);
  });
  it('toConcurrentMap duplicate keys throw IllegalStateException', () =>
    expectThrows(() => Stream.of(1, 1).collect(Collectors.toConcurrentMap((x) => x, (x) => x)), ISE));
  it('toConcurrentMap with merge', () => expect(Stream.of(1, 1, 1).collect(Collectors.toConcurrentMap((x) => x, () => 1, (a, b) => a + b)).get(1)).toBe(3));
  it('toConcurrentMap with merge and map factory', () =>
    expect(Stream.of(2, 1).collect(Collectors.toConcurrentMap((x) => x, (x) => x * 10, (a, b) => a + b, () => new TreeMap<number, number>())).toString()).toBe(
      '{1=10, 2=20}',
    ));
  it('toUnmodifiableMap', () => expect(Stream.of('a', 'bb').collect(Collectors.toUnmodifiableMap((s) => s, (s) => s.length)).get('bb')).toBe(2));
  it('toUnmodifiableMap result rejects mutation', () =>
    expectThrows(() => Stream.of('a').collect(Collectors.toUnmodifiableMap((s) => s, (s) => s)).put('b', 'b'), UOE));
  it('toUnmodifiableMap duplicates throw IllegalStateException', () =>
    expectThrows(() => Stream.of('a', 'a').collect(Collectors.toUnmodifiableMap((s) => s, (s) => s)), ISE));
  // "If the mapping functions return null, NullPointerException will be thrown."
  it('toUnmodifiableMap null key throws NullPointerException', () =>
    expectThrows(() => Stream.of('a').collect(Collectors.toUnmodifiableMap(() => null, (s) => s)), NPE));
  it('toUnmodifiableMap null value throws NullPointerException', () =>
    expectThrows(() => Stream.of('a').collect(Collectors.toUnmodifiableMap((s) => s, () => null)), NPE));
  it('toUnmodifiableMap with merge function', () =>
    expect(Stream.of('a', 'a', 'b').collect(Collectors.toUnmodifiableMap((s) => s, () => 1, (x, y) => x + y)).get('a')).toBe(2));
});

describe('summarizing / teeing', () => {
  it('summarizingInt', () => {
    const st = Stream.of('a', 'bb', 'ccc').collect(Collectors.summarizingInt((s) => s.length));
    expect(st).toBeInstanceOf(IntSummaryStatistics);
    expect(st.toString()).toBe('IntSummaryStatistics{count=3, sum=6, min=1, average=2.000000, max=3}');
  });
  it('summarizingLong', () => {
    const st = Stream.of(5, 15).collect(Collectors.summarizingLong((x) => x));
    expect(st).toBeInstanceOf(LongSummaryStatistics);
    expect([st.getCount(), st.getSum(), st.getMin(), st.getMax(), st.getAverage()]).toEqual([2, 20, 5, 15, 10]);
  });
  it('summarizingDouble', () => {
    const st = Stream.of(0.5, 1.5).collect(Collectors.summarizingDouble((x) => x));
    expect(st).toBeInstanceOf(DoubleSummaryStatistics);
    expect(st.toString()).toBe('DoubleSummaryStatistics{count=2, sum=2.000000, min=0.500000, average=1.000000, max=1.500000}');
  });
  it('summarizingInt of empty', () => expect(Stream.empty<number>().collect(Collectors.summarizingInt((x) => x)).getCount()).toBe(0));
  // teeing: "Returns a Collector that is a composite of two downstream collectors. Every element is processed by both
  // downstream collectors, then their results are merged using the specified merge function into the final result."
  it('teeing merges two downstream results', () =>
    expect(Stream.of(1, 2, 3, 4).collect(Collectors.teeing(Collectors.summingInt((x: number) => x), Collectors.counting(), (sum: number, n: number) => sum / n))).toBe(2.5));
  it('teeing min and max', () => {
    const r = Stream.of(5, 9, 1).collect(
      Collectors.teeing(Collectors.minBy((a: number, b: number) => a - b), Collectors.maxBy((a: number, b: number) => a - b), (mn: Optional<number>, mx: Optional<number>) => [mn.get(), mx.get()]),
    );
    expect(r).toEqual([1, 9]);
  });
  it('teeing on empty stream merges the empty results', () =>
    expect(Stream.empty<number>().collect(Collectors.teeing(Collectors.counting(), Collectors.toList(), (n: number, l: List<number>) => `${n}:${l.size()}`))).toBe('0:0'));
  it('teeing with a null merger throws NullPointerException', () =>
    expectThrows(() => Collectors.teeing(Collectors.counting(), Collectors.counting(), null as any), NPE));
});

describe('Collector contract', () => {
  // Collector doc: "R r1 = finisher.apply(a1);  // result without splitting ...
  // R r2 = finisher.apply(combiner.apply(a2, a3));  // result with splitting" — r1 and r2 must be equivalent.
  const same = (a: unknown, b: unknown): boolean =>
    a !== null && typeof a === 'object' && typeof (a as { equals?: unknown }).equals === 'function' ? (a as { equals(o: unknown): boolean }).equals(b) : Object.is(a, b);
  const cases: [string, Collector<number, any, unknown>][] = [
    ['toList', Collectors.toList()],
    ['toSet', Collectors.toSet()],
    ['counting', Collectors.counting()],
    ['summingInt', Collectors.summingInt((x: number) => x)],
    ['averagingDouble', Collectors.averagingDouble((x: number) => x)],
    ['maxBy', Collectors.maxBy((a: number, b: number) => a - b)],
    ['reducing', Collectors.reducing(0, (a: number, b: number) => a + b)],
    ['groupingBy', Collectors.groupingBy((x: number) => x % 2)],
    ['partitioningBy', Collectors.partitioningBy((x: number) => x > 1)],
    ['toMap', Collectors.toMap((x: number) => x, (x: number) => x * 2)],
    ['mapping+joining', Collectors.mapping((x: number) => String(x), Collectors.joining(','))],
    ['collectingAndThen', Collectors.collectingAndThen(Collectors.toList<number>(), (l: List<number>) => l.size())],
    ['teeing', Collectors.teeing(Collectors.counting(), Collectors.summingInt((x: number) => x), (n: number, s: number) => n * 100 + s)],
  ];
  it.each(cases)('%s: splitting and combining gives the same result', (_n, c) => {
    const [t1, t2] = [1, 2];
    const a1 = c.supplier()();
    c.accumulator()(a1, t1);
    c.accumulator()(a1, t2);
    const r1 = c.finisher()(a1);
    const a2 = c.supplier()();
    c.accumulator()(a2, t1);
    const a3 = c.supplier()();
    c.accumulator()(a3, t2);
    const r2 = c.finisher()(c.combiner()(a2, a3));
    expect(same(r1, r2)).toBe(true);
  });
  it.each(cases)('%s: characteristics() is a set of known values', (_n, c) => {
    for (const ch of c.characteristics()) expect(['CONCURRENT', 'UNORDERED', 'IDENTITY_FINISH']).toContain(ch);
  });

  it('Characteristics constants are the reference names', () => {
    expect(Collector.Characteristics.CONCURRENT).toBe('CONCURRENT');
    expect(Collector.Characteristics.UNORDERED).toBe('UNORDERED');
    expect(Collector.Characteristics.IDENTITY_FINISH).toBe('IDENTITY_FINISH');
  });
  // Collector doc example: Collector.of(TreeSet::new, TreeSet::add, (left, right) -> { left.addAll(right); return left; })
  it('doc example: Collector.of into a TreeSet', () => {
    const intoSet = Collector.of(
      () => new TreeSet<string>(),
      (s: TreeSet<string>, w: string) => void s.add(w),
      (left: TreeSet<string>, right: TreeSet<string>) => {
        left.addAll(right);
        return left;
      },
    );
    expect(Stream.of('w2', 'w1', 'w2').collect(intoSet).toArray()).toEqual(['w1', 'w2']);
  });
  // of(supplier, accumulator, combiner, characteristics): "The resulting Collector has the Collector.Characteristics.IDENTITY_FINISH characteristic."
  it('Collector.of without finisher has IDENTITY_FINISH', () => {
    const c = Collector.of(
      () => [] as number[],
      (a: number[], x: number) => void a.push(x),
      (a: number[], b: number[]) => a.concat(b),
    );
    expect(c.characteristics().contains('IDENTITY_FINISH')).toBe(true);
  });
  it('Collector.of without finisher keeps extra characteristics', () => {
    const c = Collector.of(
      () => [] as number[],
      (a: number[], x: number) => void a.push(x),
      (a: number[], b: number[]) => a.concat(b),
      Collector.Characteristics.UNORDERED,
    );
    expect(c.characteristics().contains('UNORDERED')).toBe(true);
    expect(c.characteristics().contains('IDENTITY_FINISH')).toBe(true);
  });
  it('Collector.of with a finisher applies it', () => {
    const c = Collector.of(
      () => [] as number[],
      (a: number[], x: number) => void a.push(x),
      (a: number[], b: number[]) => a.concat(b),
      (a: number[]) => a.length,
    );
    expect(Stream.of(4, 5, 6).collect(c)).toBe(3);
  });
  it('Collector.of with a finisher reports exactly the given characteristics', () => {
    const c = Collector.of(
      () => [] as number[],
      (a: number[], x: number) => void a.push(x),
      (a: number[], b: number[]) => a.concat(b),
      (a: number[]) => a.length,
      Collector.Characteristics.UNORDERED,
    );
    expect(c.characteristics().contains('UNORDERED')).toBe(true);
    expect(c.characteristics().contains('IDENTITY_FINISH')).toBe(false);
  });
  it('Collector.of with a finisher and no characteristics reports none', () => {
    const c = Collector.of(
      () => [0],
      (a: number[], x: number) => void (a[0] += x),
      (a: number[], b: number[]) => [a[0] + b[0]],
      (a: number[]) => a[0],
    );
    expect(c.characteristics().size()).toBe(0);
    expect(Stream.of(1, 2, 3).collect(c)).toBe(6);
  });
  it('Collector.of with a null supplier throws NullPointerException', () =>
    expectThrows(() => Collector.of(null as any, (a: number[], x: number) => void a.push(x), (a: number[]) => a), NPE));
  it('a custom collector works on a parallel stream', () => {
    const c = Collector.of(
      () => new ArrayList<number>(),
      (l: ArrayList<number>, x: number) => void l.add(x),
      (l: ArrayList<number>, r: ArrayList<number>) => (l.addAll(r), l),
    );
    expect(Stream.of(1, 2, 3).parallel().collect(c).toArray()).toEqual([1, 2, 3]);
  });
});
