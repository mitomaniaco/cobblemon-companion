import {describe, expect, it} from 'vitest';
import {
  buildRealDamageRequest,
  createDamagePlannerState,
  DAMAGE_CONFIRMATION_KEYS,
  DAMAGE_STATS,
  damagePlannerReducer,
  getDamagePlannerView,
  type DamagePlannerState,
  type DamageWorkspaceIdentity,
} from '../src/features/damage/model';
import type {PlayerIndividual, PlayerSnapshot, PlayerStat, PlayerStatFact, RealDamageResult} from '../src/platform/api';

const sourceHashes = [
  {kind: 'party' as const, sha256: 'a'.repeat(64)},
  {kind: 'pc' as const, sha256: 'b'.repeat(64)},
];

function knownFacts<T>(value: T): Record<PlayerStat, PlayerStatFact<T>> {
  return Object.fromEntries(
    DAMAGE_STATS.map((stat) => [
      stat,
      {
        state: 'known' as const,
        value,
        provenance: {sourceKind: 'party' as const, nbtPath: `test.${stat}`},
      },
    ]),
  ) as Record<PlayerStat, PlayerStatFact<T>>;
}

function individual(uuid = 'individual-one'): PlayerIndividual {
  return {
    uuid,
    speciesId: 'cobblemon:bulbasaur',
    formId: 'normal',
    level: 30,
    location: {container: 'party', slot: 0},
    equippedMoves: [{id: 'cobblemon:tackle', pp: 20, ppUps: 0}],
    equippedMovesKnown: true,
    learnedMoves: [{id: 'cobblemon:seedbomb', ppUps: 0}],
    learnedMovesKnown: true,
    observed: {nature: 'cobblemon:adamant', ability: 'cobblemon:overgrow', heldItem: null},
    battleStats: {
      ivs: knownFacts(31),
      hyperTrainedIvs: knownFacts(null),
      evs: knownFacts(0),
    },
  };
}

function snapshot(actor: PlayerIndividual): PlayerSnapshot {
  return {
    schemaVersion: 2,
    capturedAt: '2026-10-01T00:00:00.000Z',
    worldName: 'test-world',
    consistency: 'best-effort',
    sources: sourceHashes.map((source) => ({...source, modifiedAt: '2026-10-01T00:00:00.000Z'})),
    individuals: [actor],
  };
}

function readyState(identity: DamageWorkspaceIdentity): DamagePlannerState {
  let state = createDamagePlannerState(identity);
  state = damagePlannerReducer(state, {type: 'candidate-selected', identity, candidateMoveId: 'cobblemon:seedbomb'});
  state = damagePlannerReducer(state, {type: 'target-updated', identity, patch: {speciesId: 'cobblemon:abra'}});
  state = damagePlannerReducer(state, {type: 'target-updated', identity, patch: {level: '25', nature: 'cobblemon:modest'}});
  state = damagePlannerReducer(state, {type: 'target-updated', identity, patch: {ability: 'cobblemon:synchronize'}});
  for (const stat of DAMAGE_STATS) {
    state = damagePlannerReducer(state, {type: 'stat-updated', identity, group: 'ivs', stat, value: '31'});
    state = damagePlannerReducer(state, {type: 'stat-updated', identity, group: 'evs', stat, value: '0'});
  }
  for (const key of DAMAGE_CONFIRMATION_KEYS) {
    state = damagePlannerReducer(state, {type: 'confirmation-updated', identity, key, checked: true});
  }
  return state;
}

describe('modelo do planejador de dano real', () => {
  it('mantém entrada manual vazia e bloqueada até todos os fatos e confirmações serem conhecidos', () => {
    const actor = individual();
    const initial = createDamagePlannerState({individualUuid: actor.uuid, revision: 3});

    expect(initial.target).toEqual({
      speciesId: '',
      level: '',
      nature: '',
      ability: '',
      ivs: {hp: '', atk: '', def: '', spa: '', spd: '', spe: ''},
      evs: {hp: '', atk: '', def: '', spa: '', spd: '', spe: ''},
    });
    expect(Object.keys(initial.confirmations).sort()).toEqual([...DAMAGE_CONFIRMATION_KEYS].sort());
    expect(getDamagePlannerView(actor, initial).ready).toBe(false);
    expect(buildRealDamageRequest(actor, snapshot(actor), initial)).toBeNull();

    const unknownActor = {
      ...actor,
      battleStats: {
        ...actor.battleStats,
        evs: {
          ...actor.battleStats.evs,
          hp: {state: 'unknown' as const, reason: 'not-captured' as const, provenance: actor.battleStats.evs.hp.provenance},
        },
      },
    };
    expect(getDamagePlannerView(unknownActor, readyState(initial.identity)).blocker).toContain('EV');
  });

  it('constrói somente o contrato real de cinco confirmações a partir do perfil explicitamente digitado', () => {
    const actor = individual();
    const identity = {individualUuid: actor.uuid, revision: 4};
    const request = buildRealDamageRequest(actor, snapshot(actor), readyState(identity));

    expect(request).not.toBeNull();
    expect(request?.target).toEqual({
      speciesId: 'cobblemon:abra',
      formId: 'normal',
      level: 25,
      nature: 'cobblemon:modest',
      ability: 'cobblemon:synchronize',
      ivs: {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31},
      evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
    });
    expect(request?.sources).toEqual(sourceHashes);
    expect(Object.keys(request?.assumptions ?? {}).sort()).toEqual([
      'actorBaselineConfirmed',
      'actorFullHpConfirmed',
      'fieldBaselineConfirmed',
      'rulesetMatchesActiveWorld',
      'targetBaselineConfirmed',
    ]);
  });

  it('aceita Gardevoir normal com Synchronize e monta a requisição de dano', () => {
    const actor = {
      ...individual(),
      speciesId: 'cobblemon:gardevoir',
      formId: 'normal',
      observed: {nature: 'cobblemon:adamant', ability: 'cobblemon:synchronize', heldItem: null},
    };
    const identity = {individualUuid: actor.uuid, revision: 5};
    const state = readyState(identity);
    const view = getDamagePlannerView(actor, state);
    const request = buildRealDamageRequest(actor, snapshot(actor), state);

    expect(view.blocker).toBeNull();
    expect(view.ready).toBe(true);
    expect(request).not.toBeNull();
    expect(request?.individualUuid).toBe(actor.uuid);
    expect(request?.candidateMoveId).toBe('cobblemon:seedbomb');
  });

  it.each([
    {individualUuid: 'individual-two', revision: 4},
    {individualUuid: 'individual-one', revision: 5},
  ])('invalida a prévia e ignora um resultado após mudança de identidade ou revisão', (nextIdentity) => {
    const identity = {individualUuid: 'individual-one', revision: 4};
    let state = readyState(identity);
    const previousTarget = state.target;
    state = damagePlannerReducer(state, {type: 'calculation-started', identity, requestId: 11});
    state = damagePlannerReducer(state, {type: 'identity-changed', identity: nextIdentity});
    const afterChange = state;
    state = damagePlannerReducer(state, {
      type: 'calculation-succeeded',
      identity,
      requestId: 11,
      result: {} as unknown as RealDamageResult,
    });

    expect(state).toBe(afterChange);
    expect(state.identity).toEqual(nextIdentity);
    expect(state.candidateMoveId).toBe('');
    expect(state.target).toEqual(previousTarget);
    expect(Object.values(state.confirmations).every((checked) => !checked)).toBe(true);
    expect(state.result).toBeNull();
    expect(state.phase).toBe('idle');
  });

  it('ignora resultado pendente quando qualquer entrada muda durante o cálculo', () => {
    const identity = {individualUuid: 'individual-one', revision: 8};
    let state = readyState(identity);
    state = damagePlannerReducer(state, {type: 'calculation-started', identity, requestId: 20});
    state = damagePlannerReducer(state, {type: 'target-updated', identity, patch: {level: '26'}});
    const afterEdit = state;
    state = damagePlannerReducer(state, {
      type: 'calculation-succeeded',
      identity,
      requestId: 20,
      result: {} as unknown as RealDamageResult,
    });

    expect(state).toBe(afterEdit);
    expect(state.target.level).toBe('26');
    expect(state.result).toBeNull();
    expect(state.phase).toBe('idle');
  });
});
