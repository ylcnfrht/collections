// Reference runner for the differential harness. Reads a script file, executes every op on the real JDK
// and prints one normalised line per op. Must stay in lock-step with tools/differential/tsRunner.ts.
// Usage: java --enable-preview -cp <dir> RefRunner <scripts-file> <output-file>
import java.io.*;
import java.math.BigDecimal;
import java.nio.file.*;
import java.util.*;
import java.util.function.*;
import java.util.stream.*;

@SuppressWarnings({"unchecked", "rawtypes"})
public class RefRunner {
  public static void main(String[] args) throws Exception {
    List<String> lines = Files.readAllLines(Path.of(args[0]));
    try (PrintWriter out = new PrintWriter(new BufferedWriter(new FileWriter(args[1])))) {
      Script s = null;
      for (String line : lines) {
        if (line.isEmpty()) continue;
        if (line.startsWith("@")) {
          s = new Script(line.split(" ")[1]);
          out.println(line.split(" ")[0]);
          continue;
        }
        out.println(s.exec(line));
      }
    }
  }

  // ---------------------------------------------------------------- normalisation

  static final long BIG = 9007199254740991L; // 2^53 - 1

  static String num(long v) {
    if (v >= BIG) return "BIG";
    if (v <= -BIG) return "-BIG";
    return Long.toString(v);
  }

  static String numD(double d) {
    if (Double.isNaN(d)) return "NaN";
    if (Double.isInfinite(d)) return d > 0 ? "Inf" : "-Inf";
    if (d == Math.rint(d)) {
      if (Math.abs(d) >= BIG) return d > 0 ? "BIG" : "-BIG";
      return Long.toString((long) d);
    }
    BigDecimal bd = new BigDecimal(Double.toString(d)).stripTrailingZeros();
    return bd.unscaledValue() + "e" + (-bd.scale());
  }

  static String fmt(Object x) {
    return fmt(x, null);
  }

  /** ord: null = decide from the runtime type; true = iteration order; false = sorted canonical form. */
  static String fmt(Object x, Boolean ord) {
    if (x == null) return "null";
    if (x instanceof String s) return "\"" + s + "\"";
    if (x instanceof Raw r) return r.s();
    if (x instanceof Boolean b) return b.toString();
    if (x instanceof Integer || x instanceof Long || x instanceof Short || x instanceof Byte) return num(((Number) x).longValue());
    if (x instanceof Double || x instanceof Float) return numD(((Number) x).doubleValue());
    if (x instanceof Optional<?> o) return o.isPresent() ? "OPT[" + fmt(o.get()) + "]" : "OPT_EMPTY";
    if (x instanceof OptionalInt o) return o.isPresent() ? "OPT[" + num(o.getAsInt()) + "]" : "OPT_EMPTY";
    if (x instanceof OptionalLong o) return o.isPresent() ? "OPT[" + num(o.getAsLong()) + "]" : "OPT_EMPTY";
    if (x instanceof OptionalDouble o) return o.isPresent() ? "OPT[" + numD(o.getAsDouble()) + "]" : "OPT_EMPTY";
    if (x instanceof IntSummaryStatistics s) return "STATS{" + s.getCount() + "," + num(s.getSum()) + "," + num(s.getMin()) + "," + num(s.getMax()) + "," + numD(s.getAverage()) + "}";
    if (x instanceof LongSummaryStatistics s) return "STATS{" + s.getCount() + "," + num(s.getSum()) + "," + num(s.getMin()) + "," + num(s.getMax()) + "," + numD(s.getAverage()) + "}";
    if (x instanceof DoubleSummaryStatistics s) return "STATS{" + s.getCount() + "," + numD(s.getSum()) + "," + numD(s.getMin()) + "," + numD(s.getMax()) + "," + numD(s.getAverage()) + "}";
    if (x instanceof Map.Entry<?, ?> e) return fmt(e.getKey()) + "=" + fmt(e.getValue());
    if (x instanceof Map<?, ?> m) {
      boolean o = ord != null ? ord : m instanceof SequencedMap;
      List<String> parts = new ArrayList<>();
      for (Map.Entry<?, ?> e : m.entrySet()) parts.add(fmt(e));
      return "{" + join(parts, o) + "}";
    }
    if (x instanceof Collection<?> c) {
      boolean o = ord != null ? ord : (c instanceof SequencedCollection);
      List<String> parts = new ArrayList<>();
      for (Object e : c) parts.add(fmt(e));
      return "[" + join(parts, o) + "]";
    }
    if (x instanceof Object[] a) return fmt(Arrays.asList(a), ord == null ? true : ord);
    if (x instanceof int[] a) return fmt(Arrays.stream(a).boxed().toList(), ord == null ? true : ord);
    if (x instanceof long[] a) return fmt(Arrays.stream(a).boxed().toList(), ord == null ? true : ord);
    if (x instanceof double[] a) return fmt(Arrays.stream(a).boxed().toList(), ord == null ? true : ord);
    return "?" + x.getClass().getSimpleName();
  }

  static String join(List<String> parts, boolean ordered) {
    if (!ordered) Collections.sort(parts);
    return String.join(",", parts);
  }

  // ---------------------------------------------------------------- tokens

  static Object el(String t) {
    if (t.equals("null")) return null;
    if (t.startsWith("'")) return t.substring(1);
    int eq = t.indexOf('=');
    if (eq > 0) return new AbstractMap.SimpleEntry<>(el(t.substring(0, eq)), el(t.substring(eq + 1)));
    if (t.contains(".")) return Double.parseDouble(t);
    return Integer.parseInt(t);
  }

  static List<Object> list(String t) {
    List<Object> r = new ArrayList<>();
    String body = t.substring(1, t.length() - 1);
    if (!body.isEmpty()) for (String p : body.split(",", -1)) r.add(el(p));
    return r;
  }

  /** {k=v,k=v} as ordered pairs */
  static List<Object[]> pairs(String t) {
    List<Object[]> r = new ArrayList<>();
    String body = t.substring(1, t.length() - 1);
    if (!body.isEmpty()) for (String p : body.split(",", -1)) {
      int i = p.indexOf('=');
      r.add(new Object[] {el(p.substring(0, i)), el(p.substring(i + 1))});
    }
    return r;
  }

  static int ni(String t) {
    return Integer.parseInt(t);
  }

  // ---------------------------------------------------------------- function catalogue

  static <T> T nn(T x) {
    if (x == null) throw new NullPointerException();
    return x;
  }

  static long fl(String f, long x) {
    return switch (f) {
      case "id" -> x;
      case "plus1" -> x + 1;
      case "times2" -> x * 2;
      case "neg" -> -x;
      case "mod3" -> x % 3;
      case "abs" -> Math.abs(x);
      case "sign" -> Long.signum(x);
      default -> throw new IllegalStateException("fl " + f);
    };
  }

  static double fd(String f, double x) {
    return switch (f) {
      case "id" -> x;
      case "plus1" -> x + 1;
      case "times2" -> x * 2;
      case "half" -> x / 2;
      case "third" -> x / 3;
      case "abs" -> Math.abs(x);
      case "trunc" -> (double) (long) x;
      default -> throw new IllegalStateException("fd " + f);
    };
  }

  static Object un(String f, Object x) {
    switch (f) {
      case "id": return x;
      case "nullf": return null;
    }
    nn(x);
    if (x instanceof String s) {
      return switch (f) {
        case "len" -> s.length();
        case "upper" -> s.toUpperCase();
        case "rev" -> new StringBuilder(s).reverse().toString();
        case "first" -> s.isEmpty() ? "" : s.substring(0, 1);
        case "dup" -> s + s;
        default -> throw new IllegalStateException("un str " + f);
      };
    }
    if (x instanceof List<?> l) {
      return switch (f) {
        case "size" -> l.size();
        case "sumList" -> { int sum = 0; for (Object o : l) sum += ((Number) nn(o)).intValue(); yield sum; }
        default -> throw new IllegalStateException("un list " + f);
      };
    }
    if (x instanceof Double d) {
      if (f.equals("trunc")) return (int) (double) d;
      return fd(f, d);
    }
    long v = ((Number) x).longValue();
    switch (f) {
      case "str": return String.valueOf(v);
      case "half": return v / 2.0;
      case "third": return v / 3.0;
      case "even": return v % 2 == 0;
    }
    long r = fl(f, v);
    return x instanceof Long ? (Object) r : (Object) (int) r;
  }

  static int ui(String f, Object x) {
    return ((Number) un(f, x)).intValue();
  }

  static boolean pl(String p, long x) {
    return switch (p) {
      case "even" -> x % 2 == 0;
      case "odd" -> x % 2 != 0;
      case "pos" -> x > 0;
      case "gt3" -> x > 3;
      case "lt10" -> x < 10;
      case "isZero" -> x == 0;
      default -> throw new IllegalStateException("pl " + p);
    };
  }

  static boolean pd(String p, double x) {
    return switch (p) {
      case "even" -> x % 2 == 0;
      case "pos" -> x > 0;
      case "gt3" -> x > 3;
      case "lt10" -> x < 10;
      case "isInt" -> x == Math.floor(x);
      default -> throw new IllegalStateException("pd " + p);
    };
  }

  static boolean po(String p, Object x) {
    nn(x);
    if (x instanceof Map.Entry<?, ?> e) return switch (p) {
      case "evenV" -> (Integer) nn(e.getValue()) % 2 == 0;
      case "posV" -> (Integer) nn(e.getValue()) > 0;
      default -> throw new IllegalStateException("po entry " + p);
    };
    if (x instanceof String s) {
      return switch (p) {
        case "empty" -> s.isEmpty();
        case "hasA" -> s.contains("a");
        case "long" -> s.length() > 1;
        default -> throw new IllegalStateException("po " + p);
      };
    }
    if (x instanceof List<?> l) return switch (p) {
      case "small" -> l.size() < 2;
      default -> throw new IllegalStateException("po list " + p);
    };
    if (x instanceof Double d) return pd(p, d);
    return pl(p, ((Number) x).longValue());
  }

  static long bl(String op, long a, long b) {
    return switch (op) {
      case "add" -> a + b;
      case "max" -> Math.max(a, b);
      case "min" -> Math.min(a, b);
      default -> throw new IllegalStateException("bl " + op);
    };
  }

  static double bd(String op, double a, double b) {
    return switch (op) {
      case "add" -> a + b;
      case "max" -> Math.max(a, b);
      case "min" -> Math.min(a, b);
      default -> throw new IllegalStateException("bd " + op);
    };
  }

  static Object bin(String op, Object a, Object b) {
    if (op.equals("nullBi")) return null;
    nn(a);
    nn(b);
    if (a instanceof String s) {
      if (op.equals("concat")) return s + b;
      throw new IllegalStateException("bin str " + op);
    }
    if (a instanceof Double || b instanceof Double) return bd(op, ((Number) a).doubleValue(), ((Number) b).doubleValue());
    long r = bl(op, ((Number) a).longValue(), ((Number) b).longValue());
    return a instanceof Long ? (Object) r : (Object) (int) r;
  }

  static int kv(Object k) {
    return k instanceof String s ? s.length() : (Integer) k;
  }

  /** (key, value) -> value */
  static Object bif(String f, Object k, Object v) {
    return switch (f) {
      case "sumKV" -> kv(nn(k)) + (Integer) nn(v);
      case "nullKV" -> null;
      case "kOnly" -> kv(nn(k));
      case "vPlus1" -> (Integer) nn(v) + 1;
      default -> throw new IllegalStateException("bif " + f);
    };
  }

  static Comparator cmp(String c) {
    Comparator mod3 = Comparator.comparingInt(x -> (int) fl("mod3", ((Number) nn(x)).longValue()));
    Comparator len = Comparator.comparingInt(x -> ((String) nn(x)).length());
    return switch (c) {
      case "null" -> null;
      case "nat" -> Comparator.naturalOrder();
      case "rev" -> Comparator.reverseOrder();
      case "mod3" -> mod3;
      case "mod3rev" -> mod3.reversed();
      case "mod3ThenRev" -> mod3.thenComparing(Comparator.reverseOrder());
      case "len" -> len;
      case "lenNat" -> len.thenComparing(Comparator.naturalOrder());
      case "nullsFirst" -> Comparator.nullsFirst(Comparator.naturalOrder());
      case "nullsLast" -> Comparator.nullsLast(Comparator.naturalOrder());
      case "byKey" -> Map.Entry.comparingByKey();
      case "byValue" -> Map.Entry.comparingByValue();
      case "byKeyRev" -> Map.Entry.comparingByKey(Comparator.reverseOrder());
      case "byValueRev" -> Map.Entry.comparingByValue(Comparator.reverseOrder());
      default -> throw new IllegalStateException("cmp " + c);
    };
  }

  static Stream<Object> flatO(String f, Object x) {
    switch (f) {
      case "dup": return Stream.of(x, x);
      case "nullS": return null;
    }
    nn(x);
    return switch (f) {
      case "upto" -> (Stream) IntStream.range(0, (int) (Math.abs(((Number) x).longValue()) % 4)).boxed();
      case "chars" -> ((String) x).chars().mapToObj(c -> String.valueOf((char) c));
      default -> throw new IllegalStateException("flat " + f);
    };
  }

  /** toString of a hash-ordered container with its items sorted (the item order is unspecified). */
  static String sortedItems(String s) {
    if (s.length() < 2) return s;
    String inner = s.substring(1, s.length() - 1);
    List<String> items = inner.isEmpty() ? new ArrayList<>() : new ArrayList<>(Arrays.asList(inner.split(", ", -1)));
    Collections.sort(items);
    return s.charAt(0) + String.join(", ", items) + s.charAt(s.length() - 1);
  }

  static double numv(Object x) {
    return x instanceof String s ? s.length() : ((Number) nn(x)).doubleValue();
  }

  static int[] ints(String t) { return list(t).stream().mapToInt(x -> (Integer) x).toArray(); }
  static long[] longs(String t) { return list(t).stream().mapToLong(x -> ((Number) x).longValue()).toArray(); }
  static double[] dbls(String t) { return list(t).stream().mapToDouble(x -> ((Number) x).doubleValue()).toArray(); }

  static final Object NONE_STATE = new Object();

  /** User-defined gatherers; identical to tsRunner customGatherer. */
  static Gatherer customGatherer(String name) {
    switch (name) {
      case "dedupe":
        return Gatherer.ofSequential(() -> new Object[] {NONE_STATE}, Gatherer.Integrator.ofGreedy((Object[] st, Object e, Gatherer.Downstream<Object> d) -> {
          if (st[0] != NONE_STATE && Objects.equals(st[0], e)) return true;
          st[0] = e;
          return d.push(e);
        }));
      case "takeN2":
        return Gatherer.ofSequential(() -> new int[] {0}, Gatherer.Integrator.of((int[] st, Object e, Gatherer.Downstream<Object> d) -> {
          if (st[0] >= 2) return false;
          st[0]++;
          return d.push(e) && st[0] < 2;
        }));
      case "sumAll":
        return Gatherer.of(() -> new long[] {0}, Gatherer.Integrator.ofGreedy((long[] st, Object e, Gatherer.Downstream<Object> d) -> {
          st[0] += ((Number) nn(e)).longValue();
          return true;
        }), (long[] x, long[] y) -> { x[0] += y[0]; return x; }, (long[] st, Gatherer.Downstream<Object> d) -> { d.push((int) st[0]); });
      case "pairs":
        return Gatherer.ofSequential(() -> new ArrayList<Object>(), Gatherer.Integrator.ofGreedy((ArrayList<Object> st, Object e, Gatherer.Downstream<Object> d) -> {
          st.add(e);
          if (st.size() == 2) {
            List<Object> p = new ArrayList<>(st);
            st.clear();
            return d.push(p);
          }
          return true;
        }), (ArrayList<Object> st, Gatherer.Downstream<Object> d) -> { if (!st.isEmpty()) d.push(new ArrayList<>(st)); });
      case "rejecting":
        return Gatherer.ofSequential(Gatherer.Integrator.of((Void st, Object e, Gatherer.Downstream<Object> d) -> {
          d.push(e);
          return !d.isRejecting();
        }));
      case "doubler":
        return Gatherer.of(Gatherer.Integrator.ofGreedy((Void st, Object e, Gatherer.Downstream<Object> d) -> d.push(un("times2", e))));
      case "defaults":
        return Gatherer.of(Gatherer.defaultInitializer(), Gatherer.Integrator.ofGreedy((Object st, Object e, Gatherer.Downstream<Object> d) -> d.push(e)),
            Gatherer.defaultCombiner(), Gatherer.defaultFinisher());
      case "indexed":
        return Gatherer.ofSequential(() -> new int[] {0}, Gatherer.Integrator.ofGreedy((int[] st, Object e, Gatherer.Downstream<Object> d) -> d.push(st[0]++)));
      case "andThen":
        return Gatherers.<Object, Object>scan(() -> 0, (x, y) -> bin("add", x, y)).andThen(Gatherers.windowFixed(2));
      case "mapConc":
        return Gatherers.mapConcurrent(2, x -> un("plus1", x));
    }
    throw new IllegalStateException("custom gatherer " + name);
  }

  // ---------------------------------------------------------------- scripts

  /** Multi-element ops: partial state after a midway exception is unspecified (see tsRunner BULK). */
  static final Set<String> BULK = Set.of("init", "addAll", "removeAll", "retainAll", "removeIf", "iterRemove", "collAddAll", "addAllAt",
      "replaceAll", "sort", "listIterSet", "sortBsearch", "bsearchCmp", "nCopiesAddAll", "putAll", "mreplaceAll", "entryRemoveIf",
      "keySetRetainAll", "iterSetValue", "shuffle", "reverse", "rotate", "fill");

  static final Set<String> UNORDERED = Set.of("PriorityQueue", "PriorityQueueRev", "HashSet", "HashMap", "IdentityHashMap", "SetOf",
      "MapOf", "SetCopyOf", "MapCopyOf", "MapOfPairs", "AbsSet", "EmptySet", "EmptyMap", "EmptySetConst", "EmptyMapConst", "Singleton",
      "SingletonMap");

  static class AbsListImpl extends AbstractList<Object> {
    final ArrayList<Object> a = new ArrayList<>();
    public Object get(int i) { return a.get(i); }
    public int size() { return a.size(); }
    @Override public Object set(int i, Object e) { return a.set(i, e); }
    @Override public void add(int i, Object e) { a.add(i, e); modCount++; }
    @Override public Object remove(int i) { Object r = a.remove(i); modCount++; return r; }
  }
  static class AbsSeqListImpl extends AbstractSequentialList<Object> {
    final LinkedList<Object> a = new LinkedList<>();
    public ListIterator<Object> listIterator(int i) { return a.listIterator(i); }
    public int size() { return a.size(); }
  }
  static class AbsSetImpl extends AbstractSet<Object> {
    final HashSet<Object> a = new HashSet<>();
    public Iterator<Object> iterator() { return a.iterator(); }
    public int size() { return a.size(); }
    @Override public boolean add(Object e) { return a.add(e); }
  }
  static class AbsMapImpl extends AbstractMap<Object, Object> {
    final LinkedHashMap<Object, Object> a = new LinkedHashMap<>();
    public Set<Map.Entry<Object, Object>> entrySet() { return a.entrySet(); }
    @Override public Object put(Object k, Object v) { return a.put(k, v); }
  }
  static class AbsQueueImpl extends AbstractQueue<Object> {
    final ArrayDeque<Object> a = new ArrayDeque<>();
    public boolean offer(Object e) { return a.offer(e); }
    public Object poll() { return a.poll(); }
    public Object peek() { return a.peek(); }
    public Iterator<Object> iterator() { return a.iterator(); }
    public int size() { return a.size(); }
  }
  static class AbsCollImpl extends AbstractCollection<Object> {
    final ArrayList<Object> a = new ArrayList<>();
    public Iterator<Object> iterator() { return a.iterator(); }
    public int size() { return a.size(); }
    @Override public boolean add(Object e) { return a.add(e); }
  }
  /** removeEldestEntry hook: keeps at most 3 entries. */
  static class LruMap extends LinkedHashMap<Object, Object> {
    @Override protected boolean removeEldestEntry(Map.Entry<Object, Object> e) { return size() > 3; }
  }

  static Object newTarget(String type) {
    return switch (type) {
      case "ArrayList", "UnmodList" -> new ArrayList<>();
      case "LinkedList" -> new LinkedList<>();
      case "Vector" -> new Vector<>();
      case "VectorCap" -> new Vector<>(2, 3);
      case "Stack" -> new Stack<>();
      case "ArrayDeque" -> new ArrayDeque<>();
      case "PriorityQueue" -> new PriorityQueue<>();
      case "PriorityQueueRev" -> new PriorityQueue<>(Comparator.reverseOrder());
      case "HashSet" -> new HashSet<>();
      case "LinkedHashSet" -> new LinkedHashSet<>();
      case "TreeSet" -> new TreeSet<>();
      case "TreeSetRev" -> new TreeSet<>(Comparator.reverseOrder());
      case "TreeSetMod3" -> new TreeSet<>(cmp("mod3"));
      case "HashMap" -> new HashMap<>();
      case "LinkedHashMap" -> new LinkedHashMap<>();
      case "LinkedHashMapAccess" -> new LinkedHashMap<>(16, 0.75f, true);
      case "LinkedHashMapLru" -> new LruMap();
      case "TreeMap" -> new TreeMap<>();
      case "TreeMapRev" -> new TreeMap<>(Comparator.reverseOrder());
      case "IdentityHashMap" -> new IdentityHashMap<>();
      case "AbsList" -> new AbsListImpl();
      case "AbsSeqList" -> new AbsSeqListImpl();
      case "AbsSet" -> new AbsSetImpl();
      case "AbsMap" -> new AbsMapImpl();
      case "AbsQueue" -> new AbsQueueImpl();
      case "AbsColl" -> new AbsCollImpl();
      default -> null;
    };
  }

  static final Object NO_IMM = new Object();

  static Object buildImmutable(String type, List<Object> l, List<Object[]> ps) {
    Object first = l.isEmpty() ? null : l.get(0);
    switch (type) {
      case "ListOf": return List.of(l.toArray());
      case "SetOf": return Set.of(l.toArray());
      case "ListCopyOf": return List.copyOf(new ArrayList<>(l));
      case "SetCopyOf": return Set.copyOf(new ArrayList<>(l));
      case "UnmodList": return Collections.unmodifiableList(new ArrayList<>(l));
      case "EmptyList": return Collections.emptyList();
      case "EmptySet": return Collections.emptySet();
      case "EmptySortedSet": return Collections.emptySortedSet();
      case "EmptyNavigableSet": return Collections.emptyNavigableSet();
      case "EmptyListConst": return Collections.EMPTY_LIST;
      case "EmptySetConst": return Collections.EMPTY_SET;
      case "SingletonList": return Collections.singletonList(first);
      case "Singleton": return Collections.singleton(first);
      case "NCopies": return Collections.nCopies(l.size(), first);
      case "MapOf": {
        Map.Entry[] es = new Map.Entry[ps.size()];
        for (int i = 0; i < es.length; i++) es[i] = Map.entry(ps.get(i)[0], ps.get(i)[1]);
        return Map.ofEntries(es);
      }
      case "MapOfPairs": return mapOfPairs(ps);
      case "MapCopyOf": { Map<Object, Object> m = new LinkedHashMap<>(); for (Object[] p : ps) m.put(p[0], p[1]); return Map.copyOf(m); }
      case "EmptyMap": return Collections.emptyMap();
      case "EmptySortedMap": return Collections.emptySortedMap();
      case "EmptyNavigableMap": return Collections.emptyNavigableMap();
      case "EmptyMapConst": return Collections.EMPTY_MAP;
      case "SingletonMap": return ps.isEmpty() ? Collections.singletonMap(null, null) : Collections.singletonMap(ps.get(0)[0], ps.get(0)[1]);
    }
    return NO_IMM;
  }

  /** Map.of with the fixed-arity overloads (up to 10 pairs). */
  static Map mapOfPairs(List<Object[]> ps) {
    Object[] k = new Object[10], v = new Object[10];
    for (int i = 0; i < ps.size(); i++) { k[i] = ps.get(i)[0]; v[i] = ps.get(i)[1]; }
    return switch (ps.size()) {
      case 0 -> Map.of();
      case 1 -> Map.of(k[0], v[0]);
      case 2 -> Map.of(k[0], v[0], k[1], v[1]);
      case 3 -> Map.of(k[0], v[0], k[1], v[1], k[2], v[2]);
      case 4 -> Map.of(k[0], v[0], k[1], v[1], k[2], v[2], k[3], v[3]);
      case 5 -> Map.of(k[0], v[0], k[1], v[1], k[2], v[2], k[3], v[3], k[4], v[4]);
      case 6 -> Map.of(k[0], v[0], k[1], v[1], k[2], v[2], k[3], v[3], k[4], v[4], k[5], v[5]);
      default -> throw new IllegalStateException("mapOfPairs " + ps.size());
    };
  }

  static Class<?> typeClass(String t) {
    return t.equals("str") ? String.class : Integer.class;
  }

  static Object applyView(Object o, String seg) {
    String[] r = seg.split(":");
    String name = r[0];
    switch (name) {
      case "subList": return ((List) o).subList(ni(r[1]), ni(r[2]));
      case "reversed": return o instanceof SequencedMap m ? m.reversed() : ((SequencedCollection) o).reversed();
      case "keySet": return ((Map) o).keySet();
      case "values": return ((Map) o).values();
      case "entrySet": return ((Map) o).entrySet();
      case "navigableKeySet": return ((NavigableMap) o).navigableKeySet();
      case "descendingKeySet": return ((NavigableMap) o).descendingKeySet();
      case "descendingMap": return ((NavigableMap) o).descendingMap();
      case "descendingSet": return ((NavigableSet) o).descendingSet();
      case "sequencedKeySet": return ((SequencedMap) o).sequencedKeySet();
      case "sequencedValues": return ((SequencedMap) o).sequencedValues();
      case "sequencedEntrySet": return ((SequencedMap) o).sequencedEntrySet();
      case "headSet": return ((NavigableSet) o).headSet(el(r[1]), Boolean.parseBoolean(r[2]));
      case "tailSet": return ((NavigableSet) o).tailSet(el(r[1]), Boolean.parseBoolean(r[2]));
      case "subSet": return ((NavigableSet) o).subSet(el(r[1]), Boolean.parseBoolean(r[2]), el(r[3]), Boolean.parseBoolean(r[4]));
      case "headSetPlain": return ((SortedSet) o).headSet(el(r[1]));
      case "tailSetPlain": return ((SortedSet) o).tailSet(el(r[1]));
      case "subSetPlain": return ((SortedSet) o).subSet(el(r[1]), el(r[2]));
      case "headMap": return ((NavigableMap) o).headMap(el(r[1]), Boolean.parseBoolean(r[2]));
      case "tailMap": return ((NavigableMap) o).tailMap(el(r[1]), Boolean.parseBoolean(r[2]));
      case "subMap": return ((NavigableMap) o).subMap(el(r[1]), Boolean.parseBoolean(r[2]), el(r[3]), Boolean.parseBoolean(r[4]));
      case "headMapPlain": return ((SortedMap) o).headMap(el(r[1]));
      case "tailMapPlain": return ((SortedMap) o).tailMap(el(r[1]));
      case "subMapPlain": return ((SortedMap) o).subMap(el(r[1]), el(r[2]));
      case "unmodifiableCollection": return Collections.unmodifiableCollection((Collection) o);
      case "unmodifiableSequencedCollection": return Collections.unmodifiableSequencedCollection((SequencedCollection) o);
      case "unmodifiableList": return Collections.unmodifiableList((List) o);
      case "unmodifiableSet": return Collections.unmodifiableSet((Set) o);
      case "unmodifiableSequencedSet": return Collections.unmodifiableSequencedSet((SequencedSet) o);
      case "unmodifiableSortedSet": return Collections.unmodifiableSortedSet((SortedSet) o);
      case "unmodifiableNavigableSet": return Collections.unmodifiableNavigableSet((NavigableSet) o);
      case "unmodifiableMap": return Collections.unmodifiableMap((Map) o);
      case "unmodifiableSequencedMap": return Collections.unmodifiableSequencedMap((SequencedMap) o);
      case "unmodifiableSortedMap": return Collections.unmodifiableSortedMap((SortedMap) o);
      case "unmodifiableNavigableMap": return Collections.unmodifiableNavigableMap((NavigableMap) o);
      case "synchronizedCollection": return Collections.synchronizedCollection((Collection) o);
      case "synchronizedList": return Collections.synchronizedList((List) o);
      case "synchronizedSet": return Collections.synchronizedSet((Set) o);
      case "synchronizedSortedSet": return Collections.synchronizedSortedSet((SortedSet) o);
      case "synchronizedNavigableSet": return Collections.synchronizedNavigableSet((NavigableSet) o);
      case "synchronizedMap": return Collections.synchronizedMap((Map) o);
      case "synchronizedSortedMap": return Collections.synchronizedSortedMap((SortedMap) o);
      case "synchronizedNavigableMap": return Collections.synchronizedNavigableMap((NavigableMap) o);
      case "checkedCollection": return Collections.checkedCollection((Collection) o, (Class) typeClass(r[1]));
      case "checkedList": return Collections.checkedList((List) o, (Class) typeClass(r[1]));
      case "checkedSet": return Collections.checkedSet((Set) o, (Class) typeClass(r[1]));
      case "checkedSortedSet": return Collections.checkedSortedSet((SortedSet) o, (Class) typeClass(r[1]));
      case "checkedNavigableSet": return Collections.checkedNavigableSet((NavigableSet) o, (Class) typeClass(r[1]));
      case "checkedQueue": return Collections.checkedQueue((Queue) o, (Class) typeClass(r[1]));
      case "checkedMap": return Collections.checkedMap((Map) o, (Class) typeClass(r[1]), Integer.class);
      case "checkedSortedMap": return Collections.checkedSortedMap((SortedMap) o, (Class) typeClass(r[1]), Integer.class);
      case "checkedNavigableMap": return Collections.checkedNavigableMap((NavigableMap) o, (Class) typeClass(r[1]), Integer.class);
      case "newSetFromMap": return Collections.newSetFromMap((Map) o);
      case "newSequencedSetFromMap": return Collections.newSequencedSetFromMap((SequencedMap) o);
      case "asLifoQueue": return Collections.asLifoQueue((Deque) o);
    }
    throw new IllegalStateException("view " + seg);
  }

  static final Set<String> PRE_INIT = Set.of("newSetFromMap", "newSequencedSetFromMap");

  static class Script {
    final String type, baseType;
    final String[] views;
    Object t, base;
    boolean dead;
    final boolean ordered, initOnView;

    Script(String type) {
      this.type = type;
      String[] segs = type.split("/");
      baseType = segs[0];
      views = Arrays.copyOfRange(segs, 1, segs.length);
      ordered = !UNORDERED.contains(baseType);
      t = base = newTarget(baseType);
      initOnView = views.length > 0 && PRE_INIT.contains(views[0].split(":")[0]);
      if (initOnView) t = applyViews(base);
    }

    Object applyViews(Object o) {
      for (String v : views) o = applyView(o, v);
      return o;
    }

    String exec(String line) {
      if (dead) return "DEAD";
      if (line.startsWith("pipe ")) return Pipe.run(line.substring(5));
      if (line.startsWith("x ")) {
        List<String> log = new ArrayList<>();
        String res;
        try {
          res = fmtTop(Misc.run(line.substring(2).split(" "), log));
        } catch (Throwable e) {
          res = exc(e);
        }
        return log.isEmpty() ? res : res + " LOG[" + String.join(",", log) + "]";
      }
      String[] a = line.split(" ");
      String res;
      try {
        res = fmtTop(op(a));
      } catch (Throwable e) {
        res = "EXC:" + e.getClass().getSimpleName();
        if (BULK.contains(a[0]) && !(e instanceof UnsupportedOperationException)) {
          dead = true;
          return res + " ;; ?";
        }
      }
      String state;
      try {
        state = fmt(t, ordered);
        if (views.length > 0) state += " || " + fmt(base, ordered);
      } catch (Throwable e) {
        state = "EXC:" + e.getClass().getSimpleName();
      }
      return res + " ;; " + state;
    }

    Collection C() { return (Collection) t; }
    List L() { return (List) t; }
    Map M() { return (Map) t; }
    NavigableSet NS() { return (NavigableSet) t; }
    NavigableMap NM() { return (NavigableMap) t; }
    Deque D() { return (Deque) t; }
    Queue Q() { return (Queue) t; }
    Vector V() { return (Vector) t; }
    SequencedCollection SC() { return (SequencedCollection) t; }
    SequencedMap SM() { return (SequencedMap) t; }

    static final String VOID = "void";

    Object ord(Object x) {
      return new Fmt(x, ordered);
    }

    Object op(String[] a) {
      String op = a[0];
      switch (op) {
        case "init": {
          boolean isPairs = a[1].startsWith("{");
          Object imm = buildImmutable(baseType, isPairs ? List.of() : list(a[1]), isPairs ? pairs(a[1]) : List.of());
          Object r = VOID;
          if (imm != NO_IMM) base = imm;
          else if (isPairs) for (Object[] p : pairs(a[1])) ((Map) base).put(p[0], p[1]);
          else r = ((Collection) (initOnView ? t : base)).addAll(list(a[1]));
          if (!initOnView) t = applyViews(base);
          return r;
        }
        // ---- shared by collections and maps
        case "size": return t instanceof Map m ? m.size() : C().size();
        case "isEmpty": return t instanceof Map m ? m.isEmpty() : C().isEmpty();
        case "clear": if (t instanceof Map m) m.clear(); else C().clear(); return VOID;
        case "hashCode": return t.hashCode();
        case "toStr": return ordered ? t.toString() : sortedItems(t.toString());
        case "equalsCopy":
          if (t instanceof Map m) return m.equals(new HashMap<>(m));
          if (t instanceof Set s) return s.equals(new HashSet<>(s));
          return t.equals(new ArrayList<>(C()));
        case "equalsL": {
          List<Object> l = list(a[1]);
          if (t instanceof Set s) return s.equals(new HashSet<>(l));
          return t.equals(l);
        }
        // ---- collection
        case "add": return C().add(el(a[1]));
        case "remove": return C().remove(el(a[1]));
        case "contains": return C().contains(el(a[1]));
        case "addAll": return C().addAll(list(a[1]));
        case "removeAll": return C().removeAll(list(a[1]));
        case "retainAll": return C().retainAll(list(a[1]));
        case "containsAll": return C().containsAll(list(a[1]));
        case "removeIf": return C().removeIf(x -> po(a[1], x));
        case "toArray": return ord(C().toArray());
        case "iterRemove": {
          int n = 0;
          for (Iterator it = C().iterator(); it.hasNext(); ) if (po(a[1], it.next())) { it.remove(); n++; }
          return n;
        }
        case "frequency": return Collections.frequency(C(), el(a[1]));
        case "min": return Collections.min(C());
        case "max": return Collections.max(C());
        case "minCmp": return Collections.min(C(), cmp(a[1]));
        case "maxCmp": return Collections.max(C(), cmp(a[1]));
        case "disjoint": return Collections.disjoint(C(), list(a[1]));
        case "collAddAll": return Collections.addAll(C(), list(a[1]).toArray());
        case "streamCount": return C().stream().filter(x -> po(a[1], x)).count();
        case "streamList": return ord(C().stream().toList());
        // ---- sequenced
        case "addFirst": SC().addFirst(el(a[1])); return VOID;
        case "addLast": SC().addLast(el(a[1])); return VOID;
        case "getFirst": return SC().getFirst();
        case "getLast": return SC().getLast();
        case "removeFirst": return SC().removeFirst();
        case "removeLast": return SC().removeLast();
        case "reversed": return t instanceof Map ? SM().reversed() : SC().reversed();
        // ---- list
        case "get": return t instanceof Map m ? m.get(el(a[1])) : L().get(ni(a[1]));
        case "set": return L().set(ni(a[1]), el(a[2]));
        case "addAt": L().add(ni(a[1]), el(a[2])); return VOID;
        case "removeAt": return L().remove(ni(a[1]));
        case "indexOf": return L().indexOf(el(a[1]));
        case "lastIndexOf": return L().lastIndexOf(el(a[1]));
        case "subList": return new ArrayList<>(L().subList(ni(a[1]), ni(a[2])));
        case "subListClear": L().subList(ni(a[1]), ni(a[2])).clear(); return VOID;
        case "subListAdd": return L().subList(ni(a[1]), ni(a[2])).add(el(a[3]));
        case "addAllAt": return L().addAll(ni(a[1]), list(a[2]));
        case "replaceAll": L().replaceAll(x -> un(a[1], x)); return VOID;
        case "sort": L().sort(cmp(a[1])); return VOID;
        case "listIterAdd": L().listIterator(ni(a[1])).add(el(a[2])); return VOID;
        case "listIterRev": {
          List<Object> r = new ArrayList<>();
          for (ListIterator it = L().listIterator(ni(a[1])); it.hasPrevious(); ) r.add(it.previous());
          return r;
        }
        case "listIterSet": {
          int n = 0;
          for (ListIterator it = L().listIterator(); it.hasNext(); ) {
            Object x = it.next();
            if (po(a[1], x)) { it.set(un(a[2], x)); n++; }
          }
          return n;
        }
        case "iterCme": { Iterator it = C().iterator(); if (!it.hasNext()) return "empty"; it.next(); C().add(el(a[1])); return it.next(); }
        case "subListCme": { List sl = L().subList(ni(a[1]), ni(a[2])); L().add(el(a[3])); return sl.size(); }
        case "mapIterCme": { Iterator it = M().keySet().iterator(); if (!it.hasNext()) return "empty"; it.next(); M().put(el(a[1]), el(a[2])); return it.hasNext() ? it.next() : "end"; }
        case "reverse": Collections.reverse(L()); return VOID;
        case "rotate": Collections.rotate(L(), ni(a[1])); return VOID;
        case "swap": Collections.swap(L(), ni(a[1]), ni(a[2])); return VOID;
        case "shuffle": Collections.shuffle(L(), new Random(Long.parseLong(a[1]))); return VOID;
        case "sortBsearch": Collections.sort(L()); return Collections.binarySearch(L(), el(a[1]));
        case "bsearchCmp": { Comparator c = cmp(a[2]); L().sort(c); return Collections.binarySearch(L(), el(a[1]), c); }
        case "fill": Collections.fill(L(), el(a[1])); return VOID;
        case "indexOfSubList": return Collections.indexOfSubList(L(), list(a[1]));
        case "lastIndexOfSubList": return Collections.lastIndexOfSubList(L(), list(a[1]));
        case "nCopiesAddAll": return C().addAll(Collections.nCopies(ni(a[1]), el(a[2])));
        // ---- stack / vector
        case "push": if (t instanceof Stack s) return s.push(el(a[1])); D().push(el(a[1])); return VOID;
        case "pop": return t instanceof Stack s ? s.pop() : D().pop();
        case "peek": return t instanceof Stack s ? s.peek() : Q().peek();
        case "empty": return ((Stack) t).empty();
        case "search": return ((Stack) t).search(el(a[1]));
        case "elementAt": return V().elementAt(ni(a[1]));
        case "firstElement": return V().firstElement();
        case "lastElement": return V().lastElement();
        case "addElement": V().addElement(el(a[1])); return VOID;
        case "removeElementAt": V().removeElementAt(ni(a[1])); return VOID;
        case "insertElementAt": V().insertElementAt(el(a[1]), ni(a[2])); return VOID;
        case "removeElement": return V().removeElement(el(a[1]));
        case "setElementAt": V().setElementAt(el(a[1]), ni(a[2])); return VOID;
        case "setSize": V().setSize(ni(a[1])); return VOID;
        // ---- queue / deque
        case "offer": return Q().offer(el(a[1]));
        case "poll": return Q().poll();
        case "element": return Q().element();
        case "removeHead": return Q().remove();
        case "pollAll": { List<Object> r = new ArrayList<>(); for (Object x; (x = Q().poll()) != null; ) r.add(x); return r; }
        case "offerFirst": return D().offerFirst(el(a[1]));
        case "offerLast": return D().offerLast(el(a[1]));
        case "pollFirst": return t instanceof Deque d ? d.pollFirst() : NS().pollFirst();
        case "pollLast": return t instanceof Deque d ? d.pollLast() : NS().pollLast();
        case "peekFirst": return D().peekFirst();
        case "peekLast": return D().peekLast();
        case "removeFirstOccurrence": return D().removeFirstOccurrence(el(a[1]));
        case "removeLastOccurrence": return D().removeLastOccurrence(el(a[1]));
        case "descIter": {
          List<Object> r = new ArrayList<>();
          for (Iterator it = t instanceof Deque d ? d.descendingIterator() : NS().descendingIterator(); it.hasNext(); ) r.add(it.next());
          return r;
        }
        // ---- navigable set
        case "first": return ((SortedSet) t).first();
        case "last": return ((SortedSet) t).last();
        case "lower": return NS().lower(el(a[1]));
        case "floor": return NS().floor(el(a[1]));
        case "ceiling": return NS().ceiling(el(a[1]));
        case "higher": return NS().higher(el(a[1]));
        case "headSet": return NS().headSet(el(a[1]), Boolean.parseBoolean(a[2]));
        case "tailSet": return NS().tailSet(el(a[1]), Boolean.parseBoolean(a[2]));
        case "subSet": return NS().subSet(el(a[1]), Boolean.parseBoolean(a[2]), el(a[3]), Boolean.parseBoolean(a[4]));
        case "headSetPlain": return ((SortedSet) t).headSet(el(a[1]));
        case "tailSetPlain": return ((SortedSet) t).tailSet(el(a[1]));
        case "subSetPlain": return ((SortedSet) t).subSet(el(a[1]), el(a[2]));
        case "descendingSet": return NS().descendingSet();
        case "headSetClear": NS().headSet(el(a[1]), false).clear(); return VOID;
        case "subSetAdd": return NS().subSet(el(a[1]), true, el(a[2]), false).add(el(a[3]));
        case "descSetPollFirst": return NS().descendingSet().pollFirst();
        // ---- map
        case "put": return M().put(el(a[1]), el(a[2]));
        case "removeKey": return M().remove(el(a[1]));
        case "remove2": return M().remove(el(a[1]), el(a[2]));
        case "containsKey": return M().containsKey(el(a[1]));
        case "containsValue": return M().containsValue(el(a[1]));
        case "getOrDefault": return M().getOrDefault(el(a[1]), el(a[2]));
        case "putIfAbsent": return M().putIfAbsent(el(a[1]), el(a[2]));
        case "replace": return M().replace(el(a[1]), el(a[2]));
        case "replace3": return M().replace(el(a[1]), el(a[2]), el(a[3]));
        case "computeIfAbsent": return M().computeIfAbsent(el(a[1]), k -> un(a[2], k));
        case "computeIfPresent": return M().computeIfPresent(el(a[1]), (k, v) -> bif(a[2], k, v));
        case "compute": return M().compute(el(a[1]), (k, v) -> bif(a[2], k, v));
        case "merge": return M().merge(el(a[1]), el(a[2]), (x, y) -> bin(a[3], x, y));
        case "mreplaceAll": M().replaceAll((k, v) -> bif(a[1], k, v)); return VOID;
        case "keySet": return ord(M().keySet());
        case "values": return ord(M().values());
        case "entrySet": return ord(M().entrySet());
        case "putAll": { Map<Object, Object> m = new LinkedHashMap<>(); for (Object[] p : pairs(a[1])) m.put(p[0], p[1]); M().putAll(m); return VOID; }
        case "keySetRemove": return M().keySet().remove(el(a[1]));
        case "valuesRemove": return M().values().remove(el(a[1]));
        case "entryRemoveIf": return M().entrySet().removeIf(e -> po(a[1], ((Map.Entry) e).getValue()));
        case "keySetRetainAll": return M().keySet().retainAll(list(a[1]));
        case "iterSetValue": { for (Object o : M().entrySet()) { Map.Entry e = (Map.Entry) o; e.setValue(un(a[1], e.getValue())); } return VOID; }
        case "entrySetContains": return M().entrySet().contains(new AbstractMap.SimpleEntry<>(el(a[1]), el(a[2])));
        case "firstEntry": return SM().firstEntry();
        case "lastEntry": return SM().lastEntry();
        case "pollFirstEntry": return SM().pollFirstEntry();
        case "pollLastEntry": return SM().pollLastEntry();
        case "putFirst": return SM().putFirst(el(a[1]), el(a[2]));
        case "putLast": return SM().putLast(el(a[1]), el(a[2]));
        case "firstKey": return ((SortedMap) t).firstKey();
        case "lastKey": return ((SortedMap) t).lastKey();
        case "lowerKey": return NM().lowerKey(el(a[1]));
        case "floorKey": return NM().floorKey(el(a[1]));
        case "ceilingKey": return NM().ceilingKey(el(a[1]));
        case "higherKey": return NM().higherKey(el(a[1]));
        case "lowerEntry": return NM().lowerEntry(el(a[1]));
        case "floorEntry": return NM().floorEntry(el(a[1]));
        case "ceilingEntry": return NM().ceilingEntry(el(a[1]));
        case "higherEntry": return NM().higherEntry(el(a[1]));
        case "headMap": return NM().headMap(el(a[1]), Boolean.parseBoolean(a[2]));
        case "tailMap": return NM().tailMap(el(a[1]), Boolean.parseBoolean(a[2]));
        case "subMap": return NM().subMap(el(a[1]), Boolean.parseBoolean(a[2]), el(a[3]), Boolean.parseBoolean(a[4]));
        case "descendingMap": return NM().descendingMap();
        case "descendingKeySet": return NM().descendingKeySet();
        case "headMapClear": NM().headMap(el(a[1]), false).clear(); return VOID;
        case "subMapPut": return NM().subMap(el(a[1]), true, el(a[2]), false).put(el(a[3]), el(a[4]));
        // ---- iteration protocols
        case "itw": return iterProg(C().iterator(), a[1], ordered);
        case "ditw": return iterProg(t instanceof Deque d ? d.descendingIterator() : NS().descendingIterator(), a[1], ordered);
        case "litw": return iterProg(L().listIterator(ni(a[1])), a[2], ordered);
        case "mitw": return iterProg((a[1].equals("k") ? M().keySet() : a[1].equals("v") ? M().values() : M().entrySet()).iterator(), a[2], ordered);
        case "splw": return splProg(C().spliterator(), a[1], ordered);
        case "enumw": return enumProg(t instanceof Vector v ? v.elements() : Collections.enumeration(C()), a[1], ordered);
        case "forEachLog": { List<Object> r = new ArrayList<>(); C().forEach(r::add); return ord(r); }
        case "mforEach": { List<Object> r = new ArrayList<>(); M().forEach((k, v) -> r.add(new Raw(fmt(k) + "=" + fmt(v)))); return ord(r); }
        case "toArrayGen": return ord(C().toArray(Object[]::new));
        case "parStream": { Stream ps = C().parallelStream(); return ps.isParallel() + "/" + fmtTop(ord(ps.toList())); }
        case "isRA": return t instanceof RandomAccess;
        case "cloneEq": {
          Object c;
          try { c = t.getClass().getMethod("clone").invoke(t); } catch (java.lang.reflect.InvocationTargetException e) { throw (RuntimeException) e.getCause(); } catch (ReflectiveOperationException e) { throw new IllegalStateException(e); }
          return fmt(c, ordered) + "/" + c.equals(t) + "/" + (c != t);
        }
        case "ensureCapacity": if (t instanceof ArrayList al) al.ensureCapacity(ni(a[1])); else V().ensureCapacity(ni(a[1])); return VOID;
        case "trimToSize": if (t instanceof ArrayList al) al.trimToSize(); else V().trimToSize(); return VOID;
        case "capacity": return V().capacity();
        case "copyInto": { Object[] arr = new Object[V().size() + 1]; V().copyInto(arr); return arr; }
        case "removeAllElements": V().removeAllElements(); return VOID;
        case "clist": return ord(Collections.list(Collections.enumeration(C())));
        case "ccopyFrom": Collections.copy(L(), list(a[1])); return VOID;
        case "creplaceAll": return Collections.replaceAll(L(), el(a[1]), el(a[2]));
        case "cmpProbe": {
          Comparator c = t instanceof SortedMap m ? m.comparator() : t instanceof PriorityQueue q ? q.comparator() : ((SortedSet) t).comparator();
          return c == null ? null : Integer.signum(c.compare(el(a[1]), el(a[2])));
        }
        case "addOther": return C().add(el(a[1]) instanceof String ? (Object) 99 : "zz");
        case "putOther": return M().put(el(a[1]) instanceof String ? (Object) 99 : "zz", 1);
        case "sequencedKeySet": return SM().sequencedKeySet();
        case "sequencedValues": return SM().sequencedValues();
        case "sequencedEntrySet": return SM().sequencedEntrySet();
        case "navigableKeySet": return NM().navigableKeySet();
        case "headMapPlain": return ((SortedMap) t).headMap(el(a[1]));
        case "tailMapPlain": return ((SortedMap) t).tailMap(el(a[1]));
        case "subMapPlain": return ((SortedMap) t).subMap(el(a[1]), el(a[2]));
        case "streamSorted": return C().stream().sorted(cmp(a[1])).toList();
      }
      throw new IllegalStateException("unknown op " + op);
    }
  }

  /** Printed as-is (already formatted). */
  record Raw(String s) {}

  // ---------------------------------------------------------------- misc (statics, Optional, comparators, entries, ...)

  /** Comparator expression (prefix); same grammar as tsRunner CmpExpr. */
  static class CmpExpr {
    final String[] a;
    int i;
    CmpExpr(String[] a, int i) { this.a = a; this.i = i; }
    String next() { return a[i++]; }
    Comparator parse() {
      String n = next();
      switch (n) {
        case "nat": return Comparator.naturalOrder();
        case "rev": return Comparator.reverseOrder();
        case "natCmp": return Comparator.naturalOrder();
        case "named": return cmp(next());
        case "revOf": return parse().reversed();
        case "crev0": return Collections.reverseOrder();
        case "crev": return Collections.reverseOrder(parse());
        case "comparing": { String f = next(); return Comparator.comparing(x -> (Comparable) un(f, x)); }
        case "comparingC": { String f = next(); return Comparator.comparing(x -> un(f, x), parse()); }
        case "comparingInt": { String f = next(); return Comparator.comparingInt(x -> ((Number) nn(un(f, x))).intValue()); }
        case "comparingLong": { String f = next(); return Comparator.comparingLong(x -> ((Number) nn(un(f, x))).longValue()); }
        case "comparingDouble": { String f = next(); return Comparator.comparingDouble(x -> ((Number) nn(un(f, x))).doubleValue()); }
        case "then": { Comparator x = parse(); return x.thenComparing(parse()); }
        case "thenBy": { Comparator x = parse(); String f = next(); return x.thenComparing(y -> (Comparable) un(f, y)); }
        case "thenByC": { Comparator x = parse(); String f = next(); return x.thenComparing(y -> un(f, y), parse()); }
        case "thenInt": { Comparator x = parse(); String f = next(); return x.thenComparingInt(y -> ((Number) nn(un(f, y))).intValue()); }
        case "thenLong": { Comparator x = parse(); String f = next(); return x.thenComparingLong(y -> ((Number) nn(un(f, y))).longValue()); }
        case "thenDouble": { Comparator x = parse(); String f = next(); return x.thenComparingDouble(y -> ((Number) nn(un(f, y))).doubleValue()); }
        case "nullsFirst": return Comparator.nullsFirst(parse());
        case "nullsLast": return Comparator.nullsLast(parse());
      }
      throw new IllegalStateException("cmpexpr " + n);
    }
  }

  static int CH(String t) {
    if (t.equals("0")) return 0;
    int r = 0;
    for (String n : t.split("\\+")) for (int i = 0; i < CHAR_NAMES.length; i++) if (CHAR_NAMES[i].equals(n)) r |= CHAR_VALUES[i];
    return r;
  }

  static class ListSpliterator extends Spliterators.AbstractSpliterator<Object> {
    final List<Object> l;
    int i;
    ListSpliterator(List<Object> l) { super(l.size(), Spliterator.ORDERED); this.l = l; }
    public boolean tryAdvance(java.util.function.Consumer<? super Object> action) {
      nn(action);
      if (i >= l.size()) return false;
      action.accept(l.get(i++));
      return true;
    }
  }
  static class IntListSpliterator extends Spliterators.AbstractIntSpliterator {
    final int[] l;
    int i;
    IntListSpliterator(int[] l) { super(l.length, Spliterator.ORDERED | Spliterator.NONNULL); this.l = l; }
    public boolean tryAdvance(IntConsumer action) {
      nn(action);
      if (i >= l.length) return false;
      action.accept(l[i++]);
      return true;
    }
  }

  static Spliterator splSource(String[] a) {
    switch (a[0]) {
      case "array": return Spliterators.spliterator(list(a[1]).toArray(), CH(a[2]));
      case "arrayRange": return Spliterators.spliterator(list(a[1]).toArray(), ni(a[2]), ni(a[3]), CH(a[4]));
      case "coll": return Spliterators.spliterator(new ArrayList<>(list(a[1])), CH(a[2]));
      case "iterSized": return Spliterators.spliterator(new ArrayList<>(list(a[1])).iterator(), ni(a[2]), CH(a[3]));
      case "unknown": return Spliterators.spliteratorUnknownSize(new ArrayList<>(list(a[1])).iterator(), CH(a[2]));
      case "empty": return Spliterators.emptySpliterator();
      case "emptyInt": return Spliterators.emptyIntSpliterator();
      case "emptyLong": return Spliterators.emptyLongSpliterator();
      case "emptyDouble": return Spliterators.emptyDoubleSpliterator();
      case "abs": return new ListSpliterator(list(a[1]));
      case "absInt": return new IntListSpliterator(ints(a[1]));
      case "absLong": {
        long[] l = longs(a[1]);
        return new Spliterators.AbstractLongSpliterator(l.length, Spliterator.ORDERED | Spliterator.NONNULL) {
          int i;
          public boolean tryAdvance(java.util.function.LongConsumer action) { nn(action); if (i >= l.length) return false; action.accept(l[i++]); return true; }
        };
      }
      case "absDouble": {
        double[] l = dbls(a[1]);
        return new Spliterators.AbstractDoubleSpliterator(Long.MAX_VALUE, Spliterator.ORDERED) {
          int i;
          public boolean tryAdvance(DoubleConsumer action) { nn(action); if (i >= l.length) return false; action.accept(l[i++]); return true; }
        };
      }
    }
    throw new IllegalStateException("spl source " + a[0]);
  }

  static int indexOf(String[] a, String x) {
    for (int i = 0; i < a.length; i++) if (a[i].equals(x)) return i;
    return -1;
  }

  static List<String[]> segs(String[] a) {
    List<String[]> r = new ArrayList<>();
    for (String p : String.join(" ", Arrays.copyOfRange(a, 1, a.length)).split(" \\| ")) r.add(p.split(" "));
    return r;
  }

  static String driveCollector(Collector c, List<Object> l) {
    Supplier sup = c.supplier();
    BiConsumer acc = c.accumulator();
    BinaryOperator comb = c.combiner();
    Function fin = c.finisher();
    int h = l.size() >> 1;
    Object a1 = sup.get(), a2 = sup.get();
    for (Object x : l.subList(0, h)) acc.accept(a1, x);
    for (Object x : l.subList(h, l.size())) acc.accept(a2, x);
    Object r = fin.apply(comb.apply(a1, a2));
    List<String> chars = new ArrayList<>();
    for (Object ch : (Set<?>) c.characteristics()) chars.add(ch.toString());
    Collections.sort(chars);
    return fmt(r) + " " + String.join("|", chars);
  }

  static class Misc {
    static Object run(String[] a, List<String> log) {
      switch (a[0]) {
        case "oeq": return Objects.equals(el(a[1]), el(a[2]));
        case "ohash": return Objects.hashCode(el(a[1]));
        case "ohashv": return Objects.hash(list(a[1]).toArray());
        case "oreq": return Objects.requireNonNull(el(a[1]));
        case "oreqm": return Objects.requireNonNull(el(a[1]), "m");
        case "oreqs": return Objects.requireNonNull(el(a[1]), () -> "m");
        case "oisnull": return Objects.isNull(el(a[1]));
        case "ononnull": return Objects.nonNull(el(a[1]));
        case "ostr": return Objects.toString(el(a[1]));
        case "ostr2": return Objects.toString(el(a[1]), (String) el(a[2]));
        case "ochk": return Objects.checkIndex(ni(a[1]), ni(a[2]));
        case "ochkft": return Objects.checkFromToIndex(ni(a[1]), ni(a[2]), ni(a[3]));
        case "ochkfs": return Objects.checkFromIndexSize(ni(a[1]), ni(a[2]), ni(a[3]));
        case "oelse": return Objects.requireNonNullElse(el(a[1]), el(a[2]));
        case "oelseget": { Object d = el(a[2]); return Objects.requireNonNullElseGet(el(a[1]), () -> d); }
        case "ocmp": return Integer.signum(Objects.compare(el(a[1]), el(a[2]), new CmpExpr(a, 3).parse()));
        case "odeq": return Objects.deepEquals(list(a[1]).toArray(), list(a[2]).toArray());
        case "csort": { List<Object> l = new ArrayList<>(list(a[1])); l.sort(new CmpExpr(a, 2).parse()); return l; }
        case "capply": return Integer.signum(new CmpExpr(a, 3).parse().compare(el(a[1]), el(a[2])));
        case "splconst": return List.of(Spliterator.DISTINCT, Spliterator.SORTED, Spliterator.ORDERED, Spliterator.SIZED, Spliterator.NONNULL,
            Spliterator.IMMUTABLE, Spliterator.CONCURRENT, Spliterator.SUBSIZED);
        case "collchars": { List<String> r = new ArrayList<>(); for (Collector.Characteristics c : Collector.Characteristics.values()) r.add(c.name()); Collections.sort(r); return r; }
        case "cemptyIter": return iterProg(Collections.emptyIterator(), a[1], true);
        case "cemptyListIter": return iterProg(Collections.emptyListIterator(), a[1], true);
        case "cemptyEnum": return enumProg(Collections.emptyEnumeration(), a[1], true);
        case "cenum": return enumProg(Collections.enumeration(new ArrayList<>(list(a[1]))), a[2], true);
        case "cconst": return fmt(Collections.EMPTY_LIST) + "/" + fmt(Collections.EMPTY_SET) + "/" + fmt(Collections.EMPTY_MAP) + "/" + Collections.EMPTY_LIST.equals(Collections.emptyList());
        case "newHash": {
          int n = ni(a[2]);
          Object m = switch (a[1]) {
            case "HashMap" -> HashMap.newHashMap(n);
            case "LinkedHashMap" -> LinkedHashMap.newLinkedHashMap(n);
            case "LinkedHashMapH" -> LinkedHashMap.newHashMap(n);
            case "HashSet" -> HashSet.newHashSet(n);
            case "LinkedHashSet" -> LinkedHashSet.newLinkedHashSet(n);
            default -> LinkedHashSet.newHashSet(n);
          };
          if (m instanceof Map mm) { mm.put(2, 1); mm.put(1, 2); } else { ((Set) m).add(2); ((Set) m).add(1); }
          return m.getClass().getSimpleName() + "/" + fmt(m, true);
        }
        case "spl": { int i = indexOf(a, "|"); return splProg(splSource(Arrays.copyOfRange(a, 1, i)), a[i + 1], true); }
        case "spit": { int i = indexOf(a, "|"); return iterProg(Spliterators.iterator(splSource(Arrays.copyOfRange(a, 1, i))), a[i + 1], true); }
        case "coll": return driveCollector(new Coll(a, 1).parse(), list(a[a.length - 1]));
        case "gath": {
          String[] ga = new String[a.length - 1];
          ga[0] = "gather";
          System.arraycopy(a, 1, ga, 1, a.length - 2);
          Gatherer g = Pipe.gatherer(ga);
          List<Object> out = new ArrayList<>();
          Gatherer.Downstream d = new Gatherer.Downstream() {
            public boolean push(Object x) { out.add(x); return true; }
            public boolean isRejecting() { return false; }
          };
          Object st = g.initializer().get();
          Gatherer.Integrator integ = g.integrator();
          for (Object x : list(a[a.length - 1])) if (!integ.integrate(st, x, d)) break;
          g.finisher().accept(st, d);
          return fmt(out) + "/" + (g.combiner() == Gatherer.defaultCombiner() ? "seq" : "par");
        }
        case "opt": return opt(a, log);
        case "stats": return stats(a);
        case "entry": return entry(a);
      }
      throw new IllegalStateException("misc " + a[0]);
    }

    static Object opt(String[] a, List<String> log) {
      List<String[]> sg = segs(a);
      String kind = sg.get(0)[0], src = sg.get(0)[1];
      String arg = sg.get(0).length > 2 ? sg.get(0)[2] : null;
      List<String> out = new ArrayList<>();
      try {
        Object o = switch (kind) {
          case "O" -> src.equals("empty") ? Optional.empty() : src.equals("of") ? Optional.of(el(arg)) : Optional.ofNullable(el(arg));
          case "I" -> src.equals("empty") ? OptionalInt.empty() : OptionalInt.of((Integer) el(arg));
          case "L" -> src.equals("empty") ? OptionalLong.empty() : OptionalLong.of(((Number) el(arg)).longValue());
          default -> src.equals("empty") ? OptionalDouble.empty() : OptionalDouble.of(((Number) el(arg)).doubleValue());
        };
        for (String[] p : sg.subList(1, sg.size())) {
          String op = p[0], x = p.length > 1 ? p[1] : null;
          switch (op) {
            case "get" -> out.add(fmt(o instanceof Optional q ? q.get() : o instanceof OptionalInt q ? q.getAsInt() : o instanceof OptionalLong q ? (Object) q.getAsLong() : ((OptionalDouble) o).getAsDouble()));
            case "isPresent" -> out.add(fmt(o instanceof Optional q ? q.isPresent() : o instanceof OptionalInt q ? q.isPresent() : o instanceof OptionalLong q ? q.isPresent() : ((OptionalDouble) o).isPresent()));
            case "isEmpty" -> out.add(fmt(o instanceof Optional q ? q.isEmpty() : o instanceof OptionalInt q ? q.isEmpty() : o instanceof OptionalLong q ? q.isEmpty() : ((OptionalDouble) o).isEmpty()));
            case "ifPresent" -> {
              if (o instanceof Optional q) q.ifPresent(v -> log.add(fmt(v)));
              else if (o instanceof OptionalInt q) q.ifPresent(v -> log.add(fmt(v)));
              else if (o instanceof OptionalLong q) q.ifPresent(v -> log.add(fmt(v)));
              else ((OptionalDouble) o).ifPresent(v -> log.add(fmt(v)));
              out.add("v");
            }
            case "ifPresentOrElse" -> {
              Runnable els = () -> log.add("else");
              if (o instanceof Optional q) q.ifPresentOrElse(v -> log.add(fmt(v)), els);
              else if (o instanceof OptionalInt q) q.ifPresentOrElse(v -> log.add(fmt(v)), els);
              else if (o instanceof OptionalLong q) q.ifPresentOrElse(v -> log.add(fmt(v)), els);
              else ((OptionalDouble) o).ifPresentOrElse(v -> log.add(fmt(v)), els);
              out.add("v");
            }
            case "filter" -> o = ((Optional) o).filter(v -> po(x, v));
            case "map" -> o = ((Optional) o).map(v -> un(x, v));
            case "flatMap" -> o = ((Optional) o).flatMap(v -> x.equals("some") ? Optional.of(un("plus1", v)) : x.equals("none") ? Optional.empty() : null);
            case "or" -> o = ((Optional) o).or(() -> x.equals("null") ? null : Optional.of(el(x)));
            case "orElse" -> out.add(fmt(o instanceof Optional q ? q.orElse(el(x)) : o instanceof OptionalInt q ? q.orElse((Integer) el(x)) : o instanceof OptionalLong q ? (Object) q.orElse(((Number) el(x)).longValue()) : ((OptionalDouble) o).orElse(((Number) el(x)).doubleValue())));
            case "orElseGet" -> out.add(fmt(o instanceof Optional q ? q.orElseGet(() -> el(x)) : o instanceof OptionalInt q ? q.orElseGet(() -> (Integer) el(x)) : o instanceof OptionalLong q ? (Object) q.orElseGet(() -> ((Number) el(x)).longValue()) : ((OptionalDouble) o).orElseGet(() -> ((Number) el(x)).doubleValue())));
            case "orElseThrow" -> out.add(fmt(o instanceof Optional q ? q.orElseThrow() : o instanceof OptionalInt q ? q.orElseThrow() : o instanceof OptionalLong q ? (Object) q.orElseThrow() : ((OptionalDouble) o).orElseThrow()));
            case "orElseThrowS" -> {
              Supplier<IllegalStateException> ex = IllegalStateException::new;
              out.add(fmt(o instanceof Optional ? ((Optional<Object>) o).orElseThrow(ex) : o instanceof OptionalInt q ? q.orElseThrow(ex) : o instanceof OptionalLong q ? (Object) q.orElseThrow(ex) : ((OptionalDouble) o).orElseThrow(ex)));
            }
            case "stream" -> out.add(fmt(o instanceof Optional q ? q.stream().toArray() : o instanceof OptionalInt q ? q.stream().toArray() : o instanceof OptionalLong q ? (Object) q.stream().toArray() : ((OptionalDouble) o).stream().toArray()));
            case "equals" -> {
              Object other = switch (kind) {
                case "O" -> x.equals("empty") ? Optional.empty() : Optional.of(el(x));
                case "I" -> x.equals("empty") ? OptionalInt.empty() : OptionalInt.of((Integer) el(x));
                case "L" -> x.equals("empty") ? OptionalLong.empty() : OptionalLong.of(((Number) el(x)).longValue());
                default -> x.equals("empty") ? OptionalDouble.empty() : OptionalDouble.of(((Number) el(x)).doubleValue());
              };
              out.add(fmt(o.equals(other)));
            }
            case "hashCode" -> out.add(fmt(o.hashCode()));
            case "toString" -> out.add(fmt(o.toString()));
            default -> throw new IllegalStateException("opt " + op);
          }
        }
        out.add(fmt(o));
      } catch (RuntimeException e) {
        out.add(exc(e));
      }
      return new Raw("[" + String.join(",", out) + "]");
    }

    static Object stats(String[] a) {
      List<String[]> sg = segs(a);
      String[] h = sg.get(0);
      String kind = h[0];
      List<String> out = new ArrayList<>();
      try {
        Object st;
        Supplier<Object> fresh = switch (kind) { case "I" -> IntSummaryStatistics::new; case "L" -> LongSummaryStatistics::new; default -> DoubleSummaryStatistics::new; };
        if (h[1].equals("new")) st = fresh.get();
        else {
          long c = Long.parseLong(h[2]);
          st = switch (kind) {
            case "I" -> new IntSummaryStatistics(c, Integer.parseInt(h[3]), Integer.parseInt(h[4]), Long.parseLong(h[5]));
            case "L" -> new LongSummaryStatistics(c, Long.parseLong(h[3]), Long.parseLong(h[4]), Long.parseLong(h[5]));
            default -> new DoubleSummaryStatistics(c, Double.parseDouble(h[3]), Double.parseDouble(h[4]), Double.parseDouble(h[5]));
          };
        }
        for (String[] p : sg.subList(1, sg.size())) {
          String op = p[0];
          switch (op) {
            case "accept" -> {
              if (st instanceof IntSummaryStatistics s) s.accept(Integer.parseInt(p[1]));
              else if (st instanceof LongSummaryStatistics s) s.accept(Long.parseLong(p[1]));
              else ((DoubleSummaryStatistics) st).accept(Double.parseDouble(p[1]));
            }
            case "combine" -> {
              Object o = fresh.get();
              for (Object v : list(p[1])) {
                if (o instanceof IntSummaryStatistics s) s.accept((Integer) v);
                else if (o instanceof LongSummaryStatistics s) s.accept(((Number) v).longValue());
                else ((DoubleSummaryStatistics) o).accept(((Number) v).doubleValue());
              }
              if (st instanceof IntSummaryStatistics s) s.combine((IntSummaryStatistics) o);
              else if (st instanceof LongSummaryStatistics s) s.combine((LongSummaryStatistics) o);
              else ((DoubleSummaryStatistics) st).combine((DoubleSummaryStatistics) o);
            }
            case "toString" -> out.add(fmt(st.toString().replaceAll("9223372036854775807|9223372036854775808", "BIG")));
            default -> out.add(fmt(st.getClass().getMethod(op).invoke(st)));
          }
        }
      } catch (java.lang.reflect.InvocationTargetException e) {
        out.add(exc(e.getCause()));
      } catch (ReflectiveOperationException e) {
        throw new IllegalStateException(e);
      } catch (RuntimeException e) {
        out.add(exc(e));
      }
      return new Raw("[" + String.join(",", out) + "]");
    }

    static Object entry(String[] a) {
      List<String[]> sg = segs(a);
      String kind = sg.get(0)[0];
      Object k = el(sg.get(0)[1]), v = el(sg.get(0)[2]);
      List<String> out = new ArrayList<>();
      try {
        Map.Entry e = switch (kind) {
          case "simple" -> new AbstractMap.SimpleEntry<>(k, v);
          case "immutable" -> new AbstractMap.SimpleImmutableEntry<>(k, v);
          case "mapEntry" -> Map.entry(k, v);
          default -> Map.Entry.copyOf(new AbstractMap.SimpleEntry<>(k, v));
        };
        for (String[] p : sg.subList(1, sg.size())) {
          switch (p[0]) {
            case "getKey" -> out.add(fmt(e.getKey()));
            case "getValue" -> out.add(fmt(e.getValue()));
            case "setValue" -> out.add(fmt(e.setValue(el(p[1]))));
            case "equals" -> out.add(fmt(e.equals(new AbstractMap.SimpleEntry<>(el(p[1]), el(p[2])))));
            case "hashCode" -> out.add(fmt(e.hashCode()));
            case "toString" -> out.add(fmt(e.toString()));
            default -> throw new IllegalStateException("entry " + p[0]);
          }
        }
      } catch (RuntimeException e) {
        out.add(exc(e));
      }
      return new Raw("[" + String.join(",", out) + "]");
    }
  }

  static String exc(Throwable e) {
    return "EXC:" + e.getClass().getSimpleName();
  }

  /** Iterator program; see tsRunner iterProg. */
  static String iterProg(Iterator it, String prog, boolean ord) {
    List<String> out = new ArrayList<>();
    Object last = null;
    try {
      for (String tok : prog.split(",")) {
        char c = tok.charAt(0);
        String arg = tok.length() > 2 ? tok.substring(2) : "";
        switch (c) {
          case 'h' -> out.add(fmt(it.hasNext()));
          case 'n' -> { last = it.next(); out.add(ord ? fmt(last) : "*"); }
          case 'r' -> { it.remove(); out.add("r"); }
          case 'f' -> { List<Object> r = new ArrayList<>(); it.forEachRemaining(r::add); out.add(ord ? fmt(r) : "#" + r.size()); }
          case 'H' -> out.add(fmt(((ListIterator) it).hasPrevious()));
          case 'p' -> { last = ((ListIterator) it).previous(); out.add(ord ? fmt(last) : "*"); }
          case 'i' -> out.add(fmt(((ListIterator) it).nextIndex()));
          case 'j' -> out.add(fmt(((ListIterator) it).previousIndex()));
          case 's' -> { ((ListIterator) it).set(el(arg)); out.add("s"); }
          case 'a' -> { ((ListIterator) it).add(el(arg)); out.add("a"); }
          case 'v' -> out.add(fmt(((Map.Entry) nn(last)).setValue(el(arg))));
          default -> throw new IllegalStateException("iter " + tok);
        }
      }
    } catch (RuntimeException e) {
      out.add(exc(e));
    }
    return "[" + String.join(",", out) + "]";
  }

  static final String[] CHAR_NAMES = {"ORDERED", "DISTINCT", "SORTED", "SIZED", "NONNULL", "IMMUTABLE", "CONCURRENT", "SUBSIZED"};
  static final int[] CHAR_VALUES = {Spliterator.ORDERED, Spliterator.DISTINCT, Spliterator.SORTED, Spliterator.SIZED, Spliterator.NONNULL,
      Spliterator.IMMUTABLE, Spliterator.CONCURRENT, Spliterator.SUBSIZED};

  static String charNames(int c) {
    List<String> r = new ArrayList<>();
    for (int i = 0; i < CHAR_NAMES.length; i++) if ((c & CHAR_VALUES[i]) != 0) r.add(CHAR_NAMES[i]);
    return r.isEmpty() ? "none" : String.join("|", r);
  }

  static String estimate(long n) {
    return n >= BIG ? "UNKNOWN" : num(n);
  }

  /** Spliterator program; see tsRunner splProg. */
  static String splProg(Spliterator sp, String prog, boolean ord) {
    List<String> out = new ArrayList<>();
    boolean touched = false; // estimates are only specified before traversal or splitting
    try {
      for (String c : prog.split(",")) {
        if ((c.equals("e") || c.equals("x")) && touched) { out.add("~"); continue; }
        if (c.equals("t") || c.equals("f") || c.equals("s")) touched = true;
        switch (c) {
          case "t" -> { Object[] got = new Object[1]; boolean ok = sp.tryAdvance(x -> got[0] = x); out.add(ok ? (ord ? fmt(got[0]) : "*") : "false"); }
          case "f" -> { List<Object> r = new ArrayList<>(); sp.forEachRemaining(r::add); out.add(ord ? fmt(r) : "#" + r.size()); }
          case "c" -> out.add(charNames(sp.characteristics()));
          case "e" -> out.add(estimate(sp.estimateSize()));
          case "x" -> out.add(num(sp.getExactSizeIfKnown()));
          case "k" -> out.add(fmt(sp.hasCharacteristics(Spliterator.ORDERED)));
          case "g" -> out.add(sp.getComparator() == null ? "null" : "cmp");
          case "s" -> {
            // where (and whether) to split is unspecified: print prefix ++ rest, which is the encounter order for ORDERED
            Spliterator pre = sp.trySplit();
            List<Object> r = new ArrayList<>();
            if (pre != null) pre.forEachRemaining(r::add);
            sp.forEachRemaining(r::add);
            out.add("S" + (ord ? fmt(r) : "#" + r.size()));
            return "[" + String.join(",", out) + "]"; // the split spliterator's later characteristics are unspecified
          }
          default -> throw new IllegalStateException("spl " + c);
        }
      }
    } catch (RuntimeException e) {
      out.add(exc(e));
    }
    return "[" + String.join(",", out) + "]";
  }

  static String enumProg(Enumeration en, String prog, boolean ord) {
    List<String> out = new ArrayList<>();
    try {
      for (String c : prog.split(",")) {
        switch (c) {
          case "h" -> out.add(fmt(en.hasMoreElements()));
          case "n" -> { Object x = en.nextElement(); out.add(ord ? fmt(x) : "*"); }
          case "a" -> { List<Object> r = new ArrayList<>(); en.asIterator().forEachRemaining(r::add); out.add(ord ? fmt(r) : "#" + r.size()); }
          default -> throw new IllegalStateException("enum " + c);
        }
      }
    } catch (RuntimeException e) {
      out.add(exc(e));
    }
    return "[" + String.join(",", out) + "]";
  }

  /** A value to print with an explicit ordering decision for its top level. */
  record Fmt(Object x, boolean ord) {}

  static String fmtTop(Object x) {
    return x instanceof Fmt f ? fmt(f.x(), f.ord()) : fmt(x);
  }

  // ---------------------------------------------------------------- streams

  static class Pipe {
    final List<String> log = new ArrayList<>();

    static String run(String line) {
      Pipe p = new Pipe();
      String res;
      try {
        res = fmt(p.exec(line.split(" \\| ")));
      } catch (Throwable e) {
        res = "EXC:" + e.getClass().getSimpleName();
      }
      return p.log.isEmpty() ? res : res + " LOG[" + String.join(",", p.log) + "]";
    }

    Object exec(String[] stages) {
      Object cur = source(stages[0].split(" "));
      for (int i = 1; i < stages.length - 1; i++) cur = stage(cur, stages[i].split(" "));
      return terminal(cur, stages[stages.length - 1].split(" "));
    }

    static Collection<Object> newColl(String kind) {
      return switch (kind) {
        case "ArrayList" -> new ArrayList<>();
        case "LinkedList" -> new LinkedList<>();
        case "ArrayDeque" -> new ArrayDeque<>();
        case "TreeSet" -> new TreeSet<>();
        case "LinkedHashSet" -> new LinkedHashSet<>();
        case "Vector" -> new Vector<>();
        default -> throw new IllegalStateException("coll " + kind);
      };
    }

    Object source(String[] a) {
      switch (a[0]) {
        case "of": return list(a[1]).stream();
        case "ofNullable": return Stream.ofNullable(el(a[1]));
        case "empty": return Stream.empty();
        case "iterate2": { String f = a[2]; return Stream.iterate(el(a[1]), x -> un(f, x)); }
        case "iterate3": { String p = a[2], f = a[3]; return Stream.iterate(el(a[1]), x -> po(p, x), x -> un(f, x)); }
        case "generate": { Object v = el(a[1]); return Stream.generate(() -> v); }
        case "concat": return Stream.concat(list(a[1]).stream(), list(a[2]).stream());
        case "builder": { Stream.Builder<Object> b = Stream.builder(); for (Object x : list(a[1])) b.add(x); return b.build(); }
        case "coll": { Collection<Object> c = newColl(a[1]); for (Object x : list(a[2])) c.add(x); return c.stream(); }
        case "listOf": return List.of(list(a[1]).toArray()).stream();
        case "iof": return IntStream.of(list(a[1]).stream().mapToInt(x -> (Integer) x).toArray());
        case "irange": return IntStream.range(ni(a[1]), ni(a[2]));
        case "irangeClosed": return IntStream.rangeClosed(ni(a[1]), ni(a[2]));
        case "iiterate2": { String f = a[2]; return IntStream.iterate(ni(a[1]), x -> (int) fl(f, x)); }
        case "iiterate3": { String p = a[2], f = a[3]; return IntStream.iterate(ni(a[1]), x -> pl(p, x), x -> (int) fl(f, x)); }
        case "iconcat": return IntStream.concat(IntStream.of(list(a[1]).stream().mapToInt(x -> (Integer) x).toArray()), IntStream.of(list(a[2]).stream().mapToInt(x -> (Integer) x).toArray()));
        case "lof": return LongStream.of(list(a[1]).stream().mapToLong(x -> ((Number) x).longValue()).toArray());
        case "lrange": return LongStream.range(ni(a[1]), ni(a[2]));
        case "lrangeClosed": return LongStream.rangeClosed(ni(a[1]), ni(a[2]));
        case "dof": return DoubleStream.of(dbls(a[1]));
        case "sbuilderAcc": { Stream.Builder<Object> b = Stream.builder(); for (Object x : list(a[1])) b.accept(x); return b.build(); }
        case "ibuilder": { IntStream.Builder b = IntStream.builder(); for (int x : ints(a[1])) b.add(x); return b.build(); }
        case "lbuilder": { LongStream.Builder b = LongStream.builder(); for (long x : longs(a[1])) b.accept(x); return b.build(); }
        case "dbuilder": { DoubleStream.Builder b = DoubleStream.builder(); for (double x : dbls(a[1])) b.add(x); return b.build(); }
        case "igenerate": { int v = ni(a[1]); return IntStream.generate(() -> v); }
        case "lgenerate": { long v = ni(a[1]); return LongStream.generate(() -> v); }
        case "dgenerate": { double v = Double.parseDouble(a[1]); return DoubleStream.generate(() -> v); }
        case "literate2": { String f = a[2]; return LongStream.iterate(ni(a[1]), x -> fl(f, x)); }
        case "literate3": { String p = a[2], f = a[3]; return LongStream.iterate(ni(a[1]), x -> pl(p, x), x -> fl(f, x)); }
        case "diterate2": { String f = a[2]; return DoubleStream.iterate(Double.parseDouble(a[1]), x -> fd(f, x)); }
        case "diterate3": { String p = a[2], f = a[3]; return DoubleStream.iterate(Double.parseDouble(a[1]), x -> pd(p, x), x -> fd(f, x)); }
        case "lconcat": return LongStream.concat(LongStream.of(longs(a[1])), LongStream.of(longs(a[2])));
        case "dconcat": return DoubleStream.concat(DoubleStream.of(dbls(a[1])), DoubleStream.of(dbls(a[2])));
        case "iempty": return IntStream.empty();
        case "lempty": return LongStream.empty();
        case "dempty": return DoubleStream.empty();
        case "sstream": { Collection<Object> c = newColl(a[1]); for (Object x : list(a[2])) c.add(x); return StreamSupport.stream(c.spliterator(), false); }
        case "sstreamSup": {
          Collection<Object> c = newColl(a[1]);
          for (Object x : list(a[2])) c.add(x);
          return StreamSupport.stream(() -> c.spliterator(), Spliterator.ORDERED | Spliterator.SIZED, false);
        }
        case "sint": return StreamSupport.intStream(IntStream.of(ints(a[1])).spliterator(), false);
        case "slong": return StreamSupport.longStream(LongStream.of(longs(a[1])).spliterator(), false);
        case "sdouble": return StreamSupport.doubleStream(DoubleStream.of(dbls(a[1])).spliterator(), false);
      }
      throw new IllegalStateException("source " + a[0]);
    }

    Object stage(Object cur, String[] a) {
      String op = a[0];
      BaseStream bs = (BaseStream) cur;
      switch (op) {
        case "sequential": return bs.sequential();
        case "parallel": return bs.parallel();
        case "unordered": return bs.unordered();
        case "onClose": return bs.onClose(() -> log.add(a[1]));
      }
      if (cur instanceof IntStream s) {
        switch (op) {
          case "filter": return s.filter(x -> pl(a[1], x));
          case "map": return s.map(x -> (int) fl(a[1], x));
          case "mapToObj": return s.mapToObj(x -> un(a[1], x));
          case "boxed": return s.boxed();
          case "asLongStream": return s.asLongStream();
          case "asDoubleStream": return s.asDoubleStream();
          case "mapToLong": return s.mapToLong(x -> fl(a[1], x));
          case "mapToDouble": return s.mapToDouble(x -> ((Number) un(a[1], x)).doubleValue());
          case "flatMap": return s.flatMap(x -> switch (a[1]) {
            case "dup" -> IntStream.of(x, x);
            case "upto" -> IntStream.range(0, Math.abs(x) % 4);
            case "nullS" -> null;
            default -> throw new IllegalStateException();
          });
          case "mapMulti": return s.mapMulti((x, c) -> { if (a[1].equals("dup") || pl("even", x)) { c.accept(x); c.accept(x); } });
          case "distinct": return s.distinct();
          case "sorted": return s.sorted();
          case "peek": return s.peek(x -> log.add(num(x)));
          case "limit": return s.limit(ni(a[1]));
          case "skip": return s.skip(ni(a[1]));
          case "takeWhile": return s.takeWhile(x -> pl(a[1], x));
          case "dropWhile": return s.dropWhile(x -> pl(a[1], x));
        }
      } else if (cur instanceof LongStream s) {
        switch (op) {
          case "filter": return s.filter(x -> pl(a[1], x));
          case "map": return s.map(x -> fl(a[1], x));
          case "mapToObj": return s.mapToObj(x -> un(a[1], x));
          case "boxed": return s.boxed();
          case "asDoubleStream": return s.asDoubleStream();
          case "mapToInt": return s.mapToInt(x -> (int) fl(a[1], x));
          case "mapToDouble": return s.mapToDouble(x -> ((Number) un(a[1], x)).doubleValue());
          case "flatMap": return s.flatMap(x -> switch (a[1]) {
            case "dup" -> LongStream.of(x, x);
            case "upto" -> LongStream.range(0, Math.abs(x) % 4);
            case "nullS" -> null;
            default -> throw new IllegalStateException();
          });
          case "mapMulti": return s.mapMulti((x, c) -> { if (a[1].equals("dup") || pl("even", x)) { c.accept(x); c.accept(x); } });
          case "distinct": return s.distinct();
          case "sorted": return s.sorted();
          case "peek": return s.peek(x -> log.add(num(x)));
          case "limit": return s.limit(ni(a[1]));
          case "skip": return s.skip(ni(a[1]));
          case "takeWhile": return s.takeWhile(x -> pl(a[1], x));
          case "dropWhile": return s.dropWhile(x -> pl(a[1], x));
        }
      } else if (cur instanceof DoubleStream s) {
        switch (op) {
          case "filter": return s.filter(x -> pd(a[1], x));
          case "map": return s.map(x -> fd(a[1], x));
          case "mapToObj": return s.mapToObj(x -> un(a[1], x));
          case "boxed": return s.boxed();
          case "mapToInt": return s.mapToInt(x -> (int) fd(a[1], x));
          case "mapToLong": return s.mapToLong(x -> (long) fd(a[1], x));
          case "flatMap": return s.flatMap(x -> switch (a[1]) {
            case "dup" -> DoubleStream.of(x, x);
            case "nullS" -> null;
            default -> throw new IllegalStateException();
          });
          case "mapMulti": return s.mapMulti((x, c) -> { if (a[1].equals("dup") || pd("even", x)) { c.accept(x); c.accept(x); } });
          case "distinct": return s.distinct();
          case "sorted": return s.sorted();
          case "peek": return s.peek(x -> log.add(numD(x)));
          case "limit": return s.limit(ni(a[1]));
          case "skip": return s.skip(ni(a[1]));
          case "takeWhile": return s.takeWhile(x -> pd(a[1], x));
          case "dropWhile": return s.dropWhile(x -> pd(a[1], x));
        }
      } else {
        Stream<Object> s = (Stream<Object>) cur;
        switch (op) {
          case "filter": return s.filter(x -> po(a[1], x));
          case "map": return s.map(x -> un(a[1], x));
          case "mapToInt": return s.mapToInt(x -> ui(a[1], x));
          case "mapToLong": return s.mapToLong(x -> ((Number) un(a[1], x)).longValue());
          case "mapToDouble": return s.mapToDouble(x -> ((Number) un(a[1], x)).doubleValue());
          case "flatMap": return s.flatMap(x -> flatO(a[1], x));
          case "mapMulti": return s.mapMulti((x, c) -> { if (a[1].equals("dup") || po("even", x)) { c.accept(x); c.accept(x); } });
          case "distinct": return s.distinct();
          case "sorted": return s.sorted();
          case "sortedC": return s.sorted(cmp(a[1]));
          case "peek": return s.peek(x -> log.add(fmt(x)));
          case "limit": return s.limit(ni(a[1]));
          case "skip": return s.skip(ni(a[1]));
          case "takeWhile": return s.takeWhile(x -> po(a[1], x));
          case "dropWhile": return s.dropWhile(x -> po(a[1], x));
          case "gather": return s.gather(gatherer(a));
          case "flatMapToInt": return s.flatMapToInt(x -> a[1].equals("nullS") ? null : IntStream.of((int) numv(x), (int) numv(x)));
          case "flatMapToLong": return s.flatMapToLong(x -> a[1].equals("nullS") ? null : LongStream.of((long) numv(x), (long) numv(x)));
          case "flatMapToDouble": return s.flatMapToDouble(x -> a[1].equals("nullS") ? null : DoubleStream.of(numv(x), numv(x)));
          case "mapMultiToInt": return s.mapMultiToInt((x, c) -> { c.accept((int) numv(x)); c.accept((int) numv(x)); });
          case "mapMultiToLong": return s.mapMultiToLong((x, c) -> { c.accept((long) numv(x)); c.accept((long) numv(x)); });
          case "mapMultiToDouble": return s.mapMultiToDouble((x, c) -> { c.accept(numv(x)); c.accept(numv(x)); });
        }
      }
      throw new IllegalStateException("stage " + op);
    }

    static Gatherer gatherer(String[] a) {
      return switch (a[1]) {
        case "fold" -> { Object id = el(a[2]); String op = a[3]; yield Gatherers.fold(() -> id, (x, y) -> bin(op, x, y)); }
        case "scan" -> { Object id = el(a[2]); String op = a[3]; yield Gatherers.scan(() -> id, (x, y) -> bin(op, x, y)); }
        case "windowFixed" -> Gatherers.windowFixed(ni(a[2]));
        case "windowSliding" -> Gatherers.windowSliding(ni(a[2]));
        case "custom" -> customGatherer(a[2]);
        default -> throw new IllegalStateException("gatherer " + a[1]);
      };
    }

    Object terminal(Object cur, String[] a) {
      String op = a[0];
      BaseStream bs = (BaseStream) cur;
      switch (op) {
        case "isParallelT": return bs.isParallel();
        case "closeNow": bs.close(); return "void";
        case "splwT": return new Raw(splProg(bs.spliterator(), a[1], true));
      }
      if (cur instanceof IntStream s) {
        switch (op) {
          case "toArray": return s.toArray();
          case "count": return s.count();
          case "sum": return s.sum();
          case "average": return s.average();
          case "min": return s.min();
          case "max": return s.max();
          case "summaryStatistics": return s.summaryStatistics();
          case "reduce1": return s.reduce((x, y) -> (int) bl(a[1], x, y));
          case "reduce2": return s.reduce(ni(a[1]), (x, y) -> (int) bl(a[2], x, y));
          case "findFirst": return s.findFirst();
          case "findAny": return s.findAny();
          case "anyMatch": return s.anyMatch(x -> pl(a[1], x));
          case "allMatch": return s.allMatch(x -> pl(a[1], x));
          case "noneMatch": return s.noneMatch(x -> pl(a[1], x));
          case "forEach": s.forEach(x -> log.add(num(x))); return "void";
          case "boxedList": return s.boxed().toList();
          case "collect3": return s.collect(ArrayList::new, (l, x) -> l.add(x), ArrayList::addAll);
          case "forEachOrdered": s.forEachOrdered(x -> log.add(num(x))); return "void";
          case "primIter": {
            PrimitiveIterator.OfInt it = s.iterator();
            List<String> o = new ArrayList<>();
            try {
              for (String c : a[1].split(",")) {
                switch (c) {
                  case "h" -> o.add(fmt(it.hasNext()));
                  case "n" -> o.add(num(it.nextInt()));
                  case "N" -> o.add(num(it.next()));
                  case "r" -> { it.remove(); o.add("r"); }
                  default -> { List<String> r = new ArrayList<>(); it.forEachRemaining((Object x) -> r.add(fmt(x))); o.add("[" + String.join(",", r) + "]"); }
                }
              }
            } catch (RuntimeException e) {
              o.add(exc(e));
            }
            return new Raw("[" + String.join(",", o) + "]");
          }
          case "statsStr": return s.summaryStatistics().toString().replaceAll("9223372036854775807|9223372036854775808", "BIG"); // 64-bit limits
          case "findFirstStr": return s.findFirst().toString();
          case "averageStr": return s.average().toString();
        }
      } else if (cur instanceof LongStream s) {
        switch (op) {
          case "toArray": return s.toArray();
          case "count": return s.count();
          case "sum": return s.sum();
          case "average": return s.average();
          case "min": return s.min();
          case "max": return s.max();
          case "summaryStatistics": return s.summaryStatistics();
          case "reduce1": return s.reduce((x, y) -> bl(a[1], x, y));
          case "reduce2": return s.reduce(ni(a[1]), (x, y) -> bl(a[2], x, y));
          case "findFirst": return s.findFirst();
          case "findAny": return s.findAny();
          case "anyMatch": return s.anyMatch(x -> pl(a[1], x));
          case "allMatch": return s.allMatch(x -> pl(a[1], x));
          case "noneMatch": return s.noneMatch(x -> pl(a[1], x));
          case "forEach": s.forEach(x -> log.add(num(x))); return "void";
          case "boxedList": return s.boxed().toList();
          case "collect3": return s.collect(ArrayList::new, (l, x) -> l.add(x), ArrayList::addAll);
          case "forEachOrdered": s.forEachOrdered(x -> log.add(num(x))); return "void";
          case "primIter": {
            PrimitiveIterator.OfLong it = s.iterator();
            List<String> o = new ArrayList<>();
            try {
              for (String c : a[1].split(",")) {
                switch (c) {
                  case "h" -> o.add(fmt(it.hasNext()));
                  case "n" -> o.add(num(it.nextLong()));
                  case "N" -> o.add(num(it.next()));
                  case "r" -> { it.remove(); o.add("r"); }
                  default -> { List<String> r = new ArrayList<>(); it.forEachRemaining((Object x) -> r.add(fmt(x))); o.add("[" + String.join(",", r) + "]"); }
                }
              }
            } catch (RuntimeException e) {
              o.add(exc(e));
            }
            return new Raw("[" + String.join(",", o) + "]");
          }
          case "statsStr": return s.summaryStatistics().toString().replaceAll("9223372036854775807|9223372036854775808", "BIG"); // 64-bit limits
          case "findFirstStr": return s.findFirst().toString();
          case "averageStr": return s.average().toString();
        }
      } else if (cur instanceof DoubleStream s) {
        switch (op) {
          case "toArray": return s.toArray();
          case "count": return s.count();
          case "sum": return s.sum();
          case "average": return s.average();
          case "min": return s.min();
          case "max": return s.max();
          case "summaryStatistics": return s.summaryStatistics();
          case "reduce1": return s.reduce((x, y) -> bd(a[1], x, y));
          case "reduce2": return s.reduce(Double.parseDouble(a[1]), (x, y) -> bd(a[2], x, y));
          case "findFirst": return s.findFirst();
          case "findAny": return s.findAny();
          case "anyMatch": return s.anyMatch(x -> pd(a[1], x));
          case "allMatch": return s.allMatch(x -> pd(a[1], x));
          case "noneMatch": return s.noneMatch(x -> pd(a[1], x));
          case "forEach": s.forEach(x -> log.add(numD(x))); return "void";
          case "boxedList": return s.boxed().toList();
          case "collect3": return s.collect(ArrayList::new, (l, x) -> l.add(x), ArrayList::addAll);
          case "forEachOrdered": s.forEachOrdered(x -> log.add(numD(x))); return "void";
          case "primIter": {
            PrimitiveIterator.OfDouble it = s.iterator();
            List<String> o = new ArrayList<>();
            try {
              for (String c : a[1].split(",")) {
                switch (c) {
                  case "h" -> o.add(fmt(it.hasNext()));
                  case "n" -> o.add(numD(it.nextDouble()));
                  case "N" -> o.add(numD(it.next()));
                  case "r" -> { it.remove(); o.add("r"); }
                  default -> { List<String> r = new ArrayList<>(); it.forEachRemaining((Object x) -> r.add(fmt(x))); o.add("[" + String.join(",", r) + "]"); }
                }
              }
            } catch (RuntimeException e) {
              o.add(exc(e));
            }
            return new Raw("[" + String.join(",", o) + "]");
          }
          case "statsStr": return s.summaryStatistics().toString().replaceAll("9223372036854775807|9223372036854775808", "BIG"); // 64-bit limits
          case "findFirstStr": return s.findFirst().toString();
          case "averageStr": return s.average().toString();
        }
      } else {
        Stream<Object> s = (Stream<Object>) cur;
        switch (op) {
          case "toList": return s.toList();
          case "toListStr": return s.toList().toString();
          case "findFirstStr": return s.findFirst().toString();
          case "toArray": return s.toArray();
          case "count": return s.count();
          case "findFirst": return s.findFirst();
          case "findAny": return s.findAny();
          case "anyMatch": return s.anyMatch(x -> po(a[1], x));
          case "allMatch": return s.allMatch(x -> po(a[1], x));
          case "noneMatch": return s.noneMatch(x -> po(a[1], x));
          case "min": return s.min(cmp(a[1]));
          case "max": return s.max(cmp(a[1]));
          case "reduce1": return s.reduce((x, y) -> bin(a[1], x, y));
          case "reduce2": return s.reduce(el(a[1]), (x, y) -> bin(a[2], x, y));
          case "reduce3": return s.reduce(el(a[1]), (x, y) -> bin(a[2], x, y), (x, y) -> bin(a[2], x, y));
          case "collect": return s.collect(new Coll(a, 1).parse());
          case "forEach": s.forEach(x -> log.add(fmt(x))); return "void";
          case "forEachOrdered": s.forEachOrdered(x -> log.add(fmt(x))); return "void";
          case "toArrayGen": return s.toArray(Object[]::new);
          case "collect3": return s.collect(ArrayList::new, ArrayList::add, ArrayList::addAll);
          case "iterT": return new Raw(iterProg(s.iterator(), a[1], true));
          case "iterator": { List<Object> r = new ArrayList<>(); for (Iterator<Object> it = s.iterator(); it.hasNext(); ) r.add(it.next()); return r; }
        }
      }
      throw new IllegalStateException("terminal " + op);
    }
  }

  /** Prefix-notation collector parser. */
  static class Coll {
    final String[] a;
    int i;

    Coll(String[] a, int i) {
      this.a = a;
      this.i = i;
    }

    String next() {
      return a[i++];
    }

    Collector parse() {
      String n = next();
      switch (n) {
        case "toList": return Collectors.toList();
        case "toSet": return Collectors.toSet();
        case "toUnmodifiableList": return Collectors.toUnmodifiableList();
        case "toUnmodifiableSet": return Collectors.toUnmodifiableSet();
        case "toTreeSet": return Collectors.toCollection(TreeSet::new);
        case "counting": return Collectors.counting();
        case "joining": return Collectors.joining();
        case "joining3": { String d = (String) el(next()), p = (String) el(next()), s = (String) el(next()); return Collectors.joining(d, p, s); }
        case "summingInt": { String f = next(); return Collectors.summingInt(x -> ui(f, x)); }
        case "summingLong": { String f = next(); return Collectors.summingLong(x -> ((Number) un(f, x)).longValue()); }
        case "summingDouble": { String f = next(); return Collectors.summingDouble(x -> ((Number) un(f, x)).doubleValue()); }
        case "averagingInt": { String f = next(); return Collectors.averagingInt(x -> ui(f, x)); }
        case "averagingDouble": { String f = next(); return Collectors.averagingDouble(x -> ((Number) un(f, x)).doubleValue()); }
        case "summarizingInt": { String f = next(); return Collectors.summarizingInt(x -> ui(f, x)); }
        case "summarizingDouble": { String f = next(); return Collectors.summarizingDouble(x -> ((Number) un(f, x)).doubleValue()); }
        case "minBy": return Collectors.minBy(cmp(next()));
        case "maxBy": return Collectors.maxBy(cmp(next()));
        case "reducing1": { String op = next(); return Collectors.reducing((x, y) -> bin(op, x, y)); }
        case "reducing2": { Object id = el(next()); String op = next(); return Collectors.reducing(id, (x, y) -> bin(op, x, y)); }
        case "reducing3": { Object id = el(next()); String f = next(); String op = next(); return Collectors.reducing(id, x -> un(f, x), (x, y) -> bin(op, x, y)); }
        case "mapping": { String f = next(); return Collectors.mapping(x -> un(f, x), parse()); }
        case "filtering": { String p = next(); return Collectors.filtering(x -> po(p, x), parse()); }
        case "flatMapping": { String f = next(); return Collectors.flatMapping(x -> flatO(f, x), parse()); }
        case "andThenSize": return Collectors.collectingAndThen(parse(), r -> r instanceof Map m ? m.size() : ((Collection) r).size());
        case "groupingBy1": { String f = next(); return Collectors.groupingBy(x -> un(f, x)); }
        case "groupingBy2": { String f = next(); return Collectors.groupingBy(x -> un(f, x), parse()); }
        case "groupingByTree": { String f = next(); return Collectors.groupingBy(x -> un(f, x), TreeMap::new, parse()); }
        case "partitioningBy1": { String p = next(); return Collectors.partitioningBy(x -> po(p, x)); }
        case "partitioningBy2": { String p = next(); return Collectors.partitioningBy(x -> po(p, x), parse()); }
        case "toMap2": { String k = next(), v = next(); return Collectors.toMap(x -> un(k, x), x -> un(v, x)); }
        case "toMap3": { String k = next(), v = next(), op = next(); return Collectors.toMap(x -> un(k, x), x -> un(v, x), (x, y) -> bin(op, x, y)); }
        case "toMapTree": { String k = next(), v = next(), op = next(); return Collectors.toMap(x -> un(k, x), x -> un(v, x), (x, y) -> bin(op, x, y), TreeMap::new); }
        case "toUnmodifiableMap2": { String k = next(), v = next(); return Collectors.toUnmodifiableMap(x -> un(k, x), x -> un(v, x)); }
        case "teeing": { Collector c1 = parse(), c2 = parse(); return Collectors.teeing(c1, c2, (x, y) -> Arrays.asList(x, y)); }
        case "joining1": return Collectors.joining((String) el(next()));
        case "toDeque": return Collectors.toCollection(ArrayDeque::new);
        case "averagingLong": { String f = next(); return Collectors.averagingLong(x -> ((Number) nn(un(f, x))).longValue()); }
        case "summarizingLong": { String f = next(); return Collectors.summarizingLong(x -> ((Number) nn(un(f, x))).longValue()); }
        case "groupingByConc1": { String f = next(); return Collectors.groupingByConcurrent(x -> un(f, x)); }
        case "groupingByConc2": { String f = next(); return Collectors.groupingByConcurrent(x -> un(f, x), parse()); }
        case "groupingByConcTree": { String f = next(); return Collectors.groupingByConcurrent(x -> un(f, x), java.util.concurrent.ConcurrentSkipListMap::new, parse()); }
        case "toConcMap2": { String k = next(), v = next(); return Collectors.toConcurrentMap(x -> un(k, x), x -> un(v, x)); }
        case "toConcMap3": { String k = next(), v = next(), op = next(); return Collectors.toConcurrentMap(x -> un(k, x), x -> un(v, x), (x, y) -> bin(op, x, y)); }
        case "toConcMapTree": { String k = next(), v = next(), op = next(); return Collectors.toConcurrentMap(x -> un(k, x), x -> un(v, x), (x, y) -> bin(op, x, y), java.util.concurrent.ConcurrentSkipListMap::new); }
        case "toUnmodifiableMap3": { String k = next(), v = next(), op = next(); return Collectors.toUnmodifiableMap(x -> un(k, x), x -> un(v, x), (x, y) -> bin(op, x, y)); }
        case "collectorOf": return Collector.of(ArrayList::new, (List<Object> l, Object x) -> l.add(x), (l, r) -> { l.addAll(r); return l; });
        case "collectorOfF": return Collector.of(ArrayList::new, (List<Object> l, Object x) -> l.add(x), (l, r) -> { l.addAll(r); return l; }, List::size, Collector.Characteristics.UNORDERED);
      }
      throw new IllegalStateException("collector " + n);
    }
  }
}
