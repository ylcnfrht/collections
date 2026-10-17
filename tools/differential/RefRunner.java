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

  // ---------------------------------------------------------------- scripts

  /** Multi-element ops: partial state after a midway exception is unspecified (see tsRunner BULK). */
  static final Set<String> BULK = Set.of("init", "addAll", "removeAll", "retainAll", "removeIf", "iterRemove", "collAddAll", "addAllAt",
      "replaceAll", "sort", "listIterSet", "sortBsearch", "bsearchCmp", "nCopiesAddAll", "putAll", "mreplaceAll", "entryRemoveIf",
      "keySetRetainAll", "iterSetValue", "shuffle", "reverse", "rotate", "fill");

  static class Script {
    final String type;
    Object t;
    boolean dead;
    final boolean ordered;

    Script(String type) {
      this.type = type;
      this.ordered = switch (type) {
        case "PriorityQueue", "PriorityQueueRev", "HashSet", "HashMap", "IdentityHashMap", "SetOf", "MapOf" -> false;
        default -> true;
      };
      t = switch (type) {
        case "ArrayList", "UnmodList" -> new ArrayList<>();
        case "LinkedList" -> new LinkedList<>();
        case "Vector" -> new Vector<>();
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
        case "TreeMap" -> new TreeMap<>();
        case "TreeMapRev" -> new TreeMap<>(Comparator.reverseOrder());
        case "IdentityHashMap" -> new IdentityHashMap<>();
        default -> null; // ListOf, SetOf, MapOf, Stream
      };
    }

    String exec(String line) {
      if (dead) return "DEAD";
      if (line.startsWith("pipe ")) return Pipe.run(line.substring(5));
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
          if (a[1].startsWith("{")) {
            List<Object[]> ps = pairs(a[1]);
            if (type.equals("MapOf")) {
              Map.Entry[] es = new Map.Entry[ps.size()];
              for (int i = 0; i < es.length; i++) es[i] = Map.entry(ps.get(i)[0], ps.get(i)[1]);
              t = Map.ofEntries(es);
            } else for (Object[] p : ps) M().put(p[0], p[1]);
            return VOID;
          }
          List<Object> l = list(a[1]);
          switch (type) {
            case "ListOf": t = List.of(l.toArray()); return VOID;
            case "SetOf": t = Set.of(l.toArray()); return VOID;
            case "UnmodList": t = Collections.unmodifiableList(new ArrayList<>(l)); return VOID;
          }
          return C().addAll(l);
        }
        // ---- shared by collections and maps
        case "size": return t instanceof Map m ? m.size() : C().size();
        case "isEmpty": return t instanceof Map m ? m.isEmpty() : C().isEmpty();
        case "clear": if (t instanceof Map m) m.clear(); else C().clear(); return VOID;
        case "hashCode": return t.hashCode();
        case "toStr": return t.toString();
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
        case "first": return NS().first();
        case "last": return NS().last();
        case "lower": return NS().lower(el(a[1]));
        case "floor": return NS().floor(el(a[1]));
        case "ceiling": return NS().ceiling(el(a[1]));
        case "higher": return NS().higher(el(a[1]));
        case "headSet": return NS().headSet(el(a[1]), Boolean.parseBoolean(a[2]));
        case "tailSet": return NS().tailSet(el(a[1]), Boolean.parseBoolean(a[2]));
        case "subSet": return NS().subSet(el(a[1]), Boolean.parseBoolean(a[2]), el(a[3]), Boolean.parseBoolean(a[4]));
        case "headSetPlain": return NS().headSet(el(a[1]));
        case "tailSetPlain": return NS().tailSet(el(a[1]));
        case "subSetPlain": return NS().subSet(el(a[1]), el(a[2]));
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
        case "firstKey": return NM().firstKey();
        case "lastKey": return NM().lastKey();
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
      }
      throw new IllegalStateException("unknown op " + op);
    }
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
        case "dof": return DoubleStream.of(list(a[1]).stream().mapToDouble(x -> ((Number) x).doubleValue()).toArray());
      }
      throw new IllegalStateException("source " + a[0]);
    }

    Object stage(Object cur, String[] a) {
      String op = a[0];
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
        default -> throw new IllegalStateException("gatherer " + a[1]);
      };
    }

    Object terminal(Object cur, String[] a) {
      String op = a[0];
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
      }
      throw new IllegalStateException("collector " + n);
    }
  }
}
