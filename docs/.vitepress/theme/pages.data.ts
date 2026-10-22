// Build-time summary of every docs page: its title and the first sentence of its intro paragraph,
// keyed by the page link the sidebar uses. Feeds the card index on the Introduction page.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const DOCS = join(__dirname, '../..');

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.name.startsWith('.') || e.name === 'api' ? [] : e.isDirectory() ? pages(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : [],
  );
}

const MAX = 190;

/** The intro paragraph after the H1 (code blocks, tables, lists and alerts skipped), cut at a sentence end. */
function summary(md: string): string {
  const body = md.replace(/^---[\s\S]*?\n---\n/, '').replace(/^```[\s\S]*?^```/gm, '');
  const afterTitle = body.slice(body.indexOf('\n', body.search(/^# /m)) + 1);
  const para = afterTitle.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !/^([#|><:]|- |\d+\. )/.test(p)) ?? '';
  let text = para.replace(/\s+/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1');
  if (text.length > MAX) {
    const end = text.slice(0, MAX).lastIndexOf('. ');
    text = end > 40 ? text.slice(0, end + 1) : text.slice(0, MAX).replace(/\s+\S*$/, '') + '…';
  }
  // a paragraph that introduces a list ends in a colon; as a summary it reads as a full sentence
  return text.replace(/:$/, '.');
}

export default {
  watch: ['../../**/*.md'],
  load(): Record<string, { title: string; summary: string }> {
    const out: Record<string, { title: string; summary: string }> = {};
    for (const f of pages(DOCS)) {
      const md = readFileSync(f, 'utf8');
      const path = relative(DOCS, f).replace(/\.md$/, '');
      const link = path === 'README' ? '/introduction' : path === 'index' ? '/' : `/${path}`;
      out[link] = { title: md.match(/^# (.+)$/m)?.[1] ?? path, summary: summary(md) };
    }
    return out;
  },
};
