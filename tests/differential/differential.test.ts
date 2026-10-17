// Differential smoke test against the reference JDK (tools/differential). Skipped when no JDK >= 23 is installed.
// The full run is `npm run test:diff`.
import { formatReport, refAvailable, runDifferential } from '../../tools/differential/main';
import { isKnown } from '../../tools/differential/known';

const available = refAvailable();

(available ? describe : describe.skip)('differential: random op scripts agree with the reference', () => {
  it('200 seeded scripts', () => {
    const r = runDifferential({ seed: 20261018, count: 200, batch: 200, shrink: false, maxShrink: 0, quiet: true });
    const unexpected = r.groups.filter((g) => !isKnown(g.signature));
    expect(unexpected.length === 0 ? '' : formatReport({ ...r, groups: unexpected })).toBe('');
  }, 60_000);
});
