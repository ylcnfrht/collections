// Differential smoke test against the reference JDK (tools/differential). Skipped when no JDK >= 23 is installed.
// The full run is `npm run test:diff`.
import { formatReport, refAvailable, runDifferential, unexpectedGroups } from '../../tools/differential/main';

const available = refAvailable();

(available ? describe : describe.skip)('differential: random op scripts agree with the reference', () => {
  it('200 seeded scripts', () => {
    const r = runDifferential({ seed: 20261018, count: 200, batch: 200, shrink: false, maxShrink: 0, quiet: true });
    // known (known.ts) and assessed (assessments.ts: reported library differences, reference quirks) divergences are tolerated
    const unexpected = unexpectedGroups(r);
    expect(unexpected.length === 0 ? '' : formatReport({ ...r, groups: unexpected })).toBe('');
  }, 60_000);
});
