import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {ENGINE_VERSION, adaptOfflineComparison} = require('../electron/lib/offline-adapter.cjs');
const fixture = require('./fixtures/offline-companion-snapshot.json');

describe('offline adapter bundled with the app', () => {
  it('keeps fixture identities synthetic and source paths portable', () => {
    expect(fixture.player.playerUuid).toBe('00000000-0000-4000-8000-000000000001');
    expect(fixture.player.individuals[0].uuid).toBe('00000000-0000-4000-8000-000000000002');
    expect(fixture.calculation.individualId).toBe('00000000-0000-4000-8000-000000000002');
    expect(fixture.sources.map(source => source.path)).toEqual([
      'test/fixtures/offline-companion-snapshot.json',
      'node_modules/@smogon/calc/package.json',
    ]);
  });

  it('calculates the checked-in fixture with the pinned engine', () => {
    const output = adaptOfflineComparison(fixture);

    expect(ENGINE_VERSION).toBe('offline-smogon-calc-0.11.0/adapter-v2');
    expect(output.calculation.current.min).toBe(36);
    expect(output.calculation.candidate.min).toBe(50);
    expect(output.comparison.status).toBe('condicional');
  });
});
