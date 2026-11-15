<script setup lang="ts">
import { ref } from 'vue';

// Code window shown beside the home hero. A tiny highlighter keeps it free of runtime dependencies.
// The results in the comments are what the library returns (checked by running each snippet).
const examples = [
  {
    name: 'ArrayList',
    code: `import { ArrayList } from '@ylcnfrht/collections';

const fruits = new ArrayList<string>();
fruits.add('pear');
fruits.add('apple');
fruits.add('fig');
fruits.sort(null);           // natural order

fruits.get(0);               // → 'apple'
fruits.indexOf('fig');       // → 1
fruits.subList(0, 2);        // → [apple, fig]`,
  },
  {
    name: 'LinkedList',
    code: `import { LinkedList } from '@ylcnfrht/collections';

// a list and a double-ended queue in one
const deque = new LinkedList<number>();
deque.addLast(2);
deque.addFirst(1);
deque.addLast(3);

deque.peekFirst();           // → 1
deque.pollLast();            // → 3
deque.toString();            // → '[1, 2]'`,
  },
  {
    name: 'HashMap',
    code: `import { HashMap } from '@ylcnfrht/collections';

const ages = new HashMap<string, number>();
ages.put('ada', 36);

ages.merge('ada', 1, (a, b) => a + b);    // → 37
ages.getOrDefault('bob', 0);              // → 0
ages.computeIfAbsent('bob', (k) => k.length);  // → 3
ages.toString();             // → '{ada=37, bob=3}'`,
  },
  {
    name: 'HashSet',
    code: `import { HashSet, List } from '@ylcnfrht/collections';

// elements compare by value, not by reference
const seen = new HashSet<List<number>>();

seen.add(List.of(1, 2));         // → true
seen.add(List.of(1, 2));         // → false, already present
seen.contains(List.of(1, 2));    // → true
seen.size();                     // → 1`,
  },
  {
    name: 'TreeMap',
    code: `import { TreeMap } from '@ylcnfrht/collections';

// sorted by key, with navigation and range views
const plans = new TreeMap<number, string>();
plans.put(10, 'basic');
plans.put(25, 'pro');
plans.put(50, 'team');

plans.floorKey(30);          // → 25
plans.ceilingKey(30);        // → 50
plans.headMap(25);           // → {10=basic}`,
  },
  {
    name: 'Stream',
    code: `import { ArrayList } from '@ylcnfrht/collections';

const words = ArrayList.of('pear', 'apple', 'fig', 'apple');
// with new: new ArrayList<string>(), then add() each word

// lazy: each element passes through every stage in turn
words.stream()
  .distinct()
  .filter((w) => w.length > 3)
  .map((w) => w.toUpperCase())
  .toList();                 // → [PEAR, APPLE]`,
  },
];

const TOKEN = /(\/\/.*$)|('[^']*')|\b(import|from|const|new|number|string|null)\b|\b([A-Z]\w*)\b|\.(\w+)(?=\()|\b(\d+)\b/gm;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlight(src: string): string {
  let out = '';
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    out += esc(src.slice(last, m.index));
    const [all, comment, str, kw, type, fn, num] = m;
    if (comment) out += `<span class="t-cm">${esc(comment)}</span>`;
    else if (str) out += `<span class="t-str">${esc(str)}</span>`;
    else if (kw) out += `<span class="t-kw">${kw}</span>`;
    else if (type) out += `<span class="t-ty">${type}</span>`;
    else if (fn) out += `.<span class="t-fn">${fn}</span>`;
    else out += `<span class="t-num">${num ?? all}</span>`;
    last = m.index! + all.length;
  }
  return out + esc(src.slice(last));
}

const rendered = examples.map((e) => ({ name: e.name, html: highlight(e.code) }));
// every tab gets the height of the longest one, so switching does not shift the page
const maxLines = Math.max(...examples.map((e) => e.code.split('\n').length));
const active = ref(0);
</script>

<template>
  <div class="hero-code">
    <div class="hero-code-bar">
      <span class="dots" aria-hidden="true"><span /><span /><span /></span>
      <div class="tabs" role="tablist" aria-label="Examples">
        <button
          v-for="(e, i) in rendered"
          :key="e.name"
          role="tab"
          :aria-selected="i === active"
          :class="{ active: i === active }"
          @click="active = i"
        >
          {{ e.name }}
        </button>
      </div>
    </div>
    <pre role="tabpanel" :style="{ minHeight: `calc(${maxLines * 1.75}em + 38px)` }"><code v-html="rendered[active].html" /></pre>
  </div>
</template>

<style scoped>
.hero-code {
  position: relative;
  width: min(100%, 560px);
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--nd-code-window-bg);
  box-shadow: 0 24px 64px -24px rgba(15, 23, 42, 0.35), 0 2px 6px rgba(15, 23, 42, 0.06);
  overflow: hidden;
  text-align: left;
}
.hero-code-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--nd-code-window-bar);
}
.dots {
  display: flex;
  flex-shrink: 0;
  gap: 7px;
}
.dots span {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--vp-c-gray-3);
}
.tabs {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs button {
  position: relative;
  flex-shrink: 0;
  padding: 12px 10px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-2);
  transition: color 0.2s;
}
.tabs button:hover {
  color: var(--vp-c-text-1);
}
.tabs button.active {
  color: var(--vp-c-brand-1);
}
.tabs button.active::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background: var(--vp-c-brand-1);
}
.tabs button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -4px;
  border-radius: 6px;
}
pre {
  margin: 0;
  padding: 18px 20px 20px;
  overflow-x: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.75;
  color: var(--vp-c-text-1);
}
:deep(.t-cm) { color: var(--vp-c-text-3); font-style: italic; }
:deep(.t-str) { color: var(--nd-tok-str); }
:deep(.t-kw) { color: var(--nd-tok-kw); }
:deep(.t-ty) { color: var(--nd-tok-ty); }
:deep(.t-fn) { color: var(--nd-tok-fn); }
:deep(.t-num) { color: var(--nd-tok-num); }
</style>
