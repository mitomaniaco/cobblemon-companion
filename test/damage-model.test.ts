import {describe, expect, it} from 'vitest';
import {
  buildRealDamageRequest,
  createDamagePlannerState,
  DAMAGE_CONFIRMATION_KEYS,
  damageConfirmationCopy,
  DAMAGE_NATURE_OPTIONS,
  DAMAGE_SPECIES_OPTIONS,
  DAMAGE_STATS,
  damageCandidateMoves,
  damageActorBlocker,
  damageSwapBlocker,
  damagePlannerReducer,
  getDamagePlannerView,
  parseDamageInteger,
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

  describe('damageConfirmationCopy', () => {
    it('exige atestar a ausência de item quando heldItem é null (desconhecido no snapshot)', () => {
      const copy = damageConfirmationCopy('actorBaselineConfirmed', null);
      expect(copy.label).toContain('nem item');
      expect(copy.detail).toContain('não registra o item');
    });

    it('com item registrado, diz que ele entra no cálculo e não pede ausência de item', () => {
      const copy = damageConfirmationCopy('actorBaselineConfirmed', 'cobblemon:focus_sash');
      expect(copy.label).not.toContain('item');
      expect(copy.detail).toBe('O item registrado no save entra no cálculo.');
    });

    it('não altera as demais confirmações', () => {
      for (const key of DAMAGE_CONFIRMATION_KEYS.filter((candidate) => candidate !== 'actorBaselineConfirmed')) {
        expect(damageConfirmationCopy(key, null)).toEqual(damageConfirmationCopy(key, 'cobblemon:focus_sash'));
      }
    });
  });

  describe('parseDamageInteger', () => {
    it('rejeita entrada vazia', () => {
      expect(parseDamageInteger('', 0, 100)).toBeNull();
      expect(parseDamageInteger('   ', 0, 100)).toBeNull();
    });

    it('rejeita não-inteiros', () => {
      expect(parseDamageInteger('3.5', 0, 100)).toBeNull();
      expect(parseDamageInteger('NaN', 0, 100)).toBeNull();
      expect(parseDamageInteger('abc', 0, 100)).toBeNull();
    });

    it('rejeita valores fora de [minimum, maximum]', () => {
      expect(parseDamageInteger('-1', 0, 100)).toBeNull();
      expect(parseDamageInteger('101', 0, 100)).toBeNull();
      expect(parseDamageInteger('0', 1, 100)).toBeNull();
      expect(parseDamageInteger('100', 1, 99)).toBeNull();
    });

    it('aceita valores válidos no intervalo', () => {
      expect(parseDamageInteger('0', 0, 100)).toBe(0);
      expect(parseDamageInteger('50', 0, 100)).toBe(50);
      expect(parseDamageInteger('100', 0, 100)).toBe(100);
      expect(parseDamageInteger('1', 1, 100)).toBe(1);
      expect(parseDamageInteger('100', 1, 100)).toBe(100);
    });

    it('rejeita Infinity', () => {
      expect(parseDamageInteger('Infinity', 0, 100)).toBeNull();
    });
  });

  describe('damageActorBlocker', () => {
    it('bloqueia quando formId não é "normal"', () => {
      const notNormal: PlayerIndividual = {
        ...individual(),
        formId: 'mega',
      };
      expect(damageActorBlocker(notNormal)).toContain('espécie ou forma');
    });

    it('bloqueia quando speciesId não está no catálogo', () => {
      const unknown: PlayerIndividual = {...individual(), speciesId: 'cobblemon:unknown-species'};
      expect(damageActorBlocker(unknown)).toContain('espécie ou forma');
    });

    it('bloqueia quando level é null', () => {
      const noLevel: PlayerIndividual = {...individual(), level: null};
      expect(damageActorBlocker(noLevel)).toContain('nível');
    });

    it('bloqueia quando level < 1', () => {
      const lowLevel: PlayerIndividual = {...individual(), level: 0};
      expect(damageActorBlocker(lowLevel)).toContain('nível');
    });

    it('bloqueia quando level > 100', () => {
      const highLevel: PlayerIndividual = {...individual(), level: 101};
      expect(damageActorBlocker(highLevel)).toContain('nível');
    });

    it('aceita level 1 e 100 como válidos', () => {
      const level1: PlayerIndividual = {...individual(), level: 1};
      const level100: PlayerIndividual = {...individual(), level: 100};
      expect(damageActorBlocker(level1) ?? '').not.toContain('nível');
      expect(damageActorBlocker(level100) ?? '').not.toContain('nível');
    });

    it('bloqueia quando observed.nature é null', () => {
      const noNature: PlayerIndividual = {
        ...individual(),
        observed: {...individual().observed, nature: null},
      };
      expect(damageActorBlocker(noNature)).toContain('natureza');
    });

    it('bloqueia quando observed.nature não está no catálogo', () => {
      const badNature: PlayerIndividual = {
        ...individual(),
        observed: {...individual().observed, nature: 'cobblemon:unknown-nature'},
      };
      expect(damageActorBlocker(badNature)).toContain('natureza');
    });

    it('bloqueia quando observed.ability é null', () => {
      const noAbility: PlayerIndividual = {
        ...individual(),
        observed: {...individual().observed, ability: null},
      };
      expect(damageActorBlocker(noAbility)).toContain('habilidade');
    });

    it('bloqueia quando observed.ability não está no catálogo', () => {
      const badAbility: PlayerIndividual = {
        ...individual(),
        observed: {...individual().observed, ability: 'cobblemon:unknown-ability'},
      };
      expect(damageActorBlocker(badAbility)).toContain('habilidade');
    });

    it('bloqueia quando ability não pertence à lista de habilidades da espécie', () => {
      const mismatchAbility: PlayerIndividual = {
        ...individual(),
        observed: {...individual().observed, ability: 'cobblemon:synchronize'},
      };
      expect(damageActorBlocker(mismatchAbility)).toContain('não pertence ao mapeamento');
    });

    it('aceita ability com prefixo cobblemon:', () => {
      const gardevoir: PlayerIndividual = {
        ...individual(),
        speciesId: 'cobblemon:gardevoir',
        observed: {...individual().observed, ability: 'cobblemon:synchronize'},
      };
      expect(damageActorBlocker(gardevoir) ?? '').not.toContain('pertence ao mapeamento');
    });

    it('bloqueia quando heldItem não é null', () => {
      const hasItem: PlayerIndividual = {
        ...individual(),
        observed: {...individual().observed, heldItem: 'cobblemon:assault-vest'},
      };
      expect(damageActorBlocker(hasItem)).toContain('não está no catálogo compatível');
    });

    it('bloqueia quando hyperTrainedIvs é undefined', () => {
      const base = individual();
      const noHyperTrainInfo: PlayerIndividual = {
        ...base,
        battleStats: {
          ...base.battleStats,
          hyperTrainedIvs: undefined,
        } as unknown as typeof base.battleStats,
      };
      expect(damageActorBlocker(noHyperTrainInfo)).toContain('Hyper Trained');
    });

    it('bloqueia quando algum hyperTrainedIv tem state !== "known"', () => {
      const unknownHyperTrain: PlayerIndividual = {
        ...individual(),
        battleStats: {
          ...individual().battleStats,
          hyperTrainedIvs: {
            ...knownFacts(null),
            hp: {state: 'unknown', reason: 'not-captured', provenance: individual().battleStats.hyperTrainedIvs.hp.provenance},
          },
        },
      };
      expect(damageActorBlocker(unknownHyperTrain)).toContain('IV efetivo');
    });

    it('bloqueia quando IV está unknown e hyperTrainedIv.value é null', () => {
      const unknownIv: PlayerIndividual = {
        ...individual(),
        battleStats: {
          ...individual().battleStats,
          ivs: {
            ...knownFacts(31),
            hp: {state: 'unknown', reason: 'not-captured', provenance: individual().battleStats.ivs.hp.provenance},
          },
          hyperTrainedIvs: knownFacts(null),
        },
      };
      expect(damageActorBlocker(unknownIv)).toContain('IV efetivo');
    });

    it('bloqueia quando algum EV está unknown', () => {
      const unknownEv: PlayerIndividual = {
        ...individual(),
        battleStats: {
          ...individual().battleStats,
          evs: {
            ...knownFacts(0),
            def: {state: 'unknown', reason: 'not-captured', provenance: individual().battleStats.evs.def.provenance},
          },
        },
      };
      expect(damageActorBlocker(unknownEv)).toContain('EV');
    });

    it('bloqueia quando equippedMovesKnown é false', () => {
      const unknownEquipped: PlayerIndividual = {...individual(), equippedMovesKnown: false};
      expect(damageActorBlocker(unknownEquipped)).toContain('golpes');
    });

    it('bloqueia quando learnedMovesKnown é false', () => {
      const unknownLearned: PlayerIndividual = {...individual(), learnedMovesKnown: false};
      expect(damageActorBlocker(unknownLearned)).toContain('golpes');
    });

    it('bloqueia quando primeiro slot de golpe está vazio', () => {
      const noCurrentMove: PlayerIndividual = {...individual(), equippedMoves: []};
      expect(damageActorBlocker(noCurrentMove)).toContain('nenhum golpe equipado');
    });

    it('bloqueia quando primeiro golpe não está no catálogo', () => {
      const badMove: PlayerIndividual = {
        ...individual(),
        equippedMoves: [{id: 'cobblemon:unknown-move', pp: 20, ppUps: 0}],
      };
      expect(damageActorBlocker(badMove)).toContain('nenhum golpe equipado');
    });

    it('bloqueia quando não há golpes candidatos disponíveis', () => {
      const onlyEquipped: PlayerIndividual = {
        ...individual(),
        learnedMoves: [{id: 'cobblemon:tackle', ppUps: 0}],
        equippedMoves: [{id: 'cobblemon:tackle', pp: 20, ppUps: 0}],
      };
      expect(damageActorBlocker(onlyEquipped)).toContain('não há golpe aprendido compatível');
    });

    it('retorna null quando todos os bloqueadores são satisfeitos', () => {
      const valid = individual();
      expect(damageActorBlocker(valid)).toBeNull();
    });

    it('aceita item segurado do catálogo, como Focus Sash', () => {
      const withSash: PlayerIndividual = {...individual(), observed: {...individual().observed, heldItem: 'cobblemon:focus_sash'}};
      expect(damageActorBlocker(withSash)).toBeNull();
    });
  });

  describe('damageSwapBlocker', () => {
    it('devolve null para slot e candidato compatíveis', () => {
      expect(damageSwapBlocker(individual(), 0, 'cobblemon:seedbomb')).toBeNull();
    });

    it('nomeia o slot cujo golpe está fora do catálogo', () => {
      const actor: PlayerIndividual = {
        ...individual(),
        equippedMoves: [
          {id: 'cobblemon:tackle', pp: 20, ppUps: 0},
          {id: 'cobblemon:unknown-move', pp: 20, ppUps: 0},
        ],
      };
      expect(damageSwapBlocker(actor, 1, 'cobblemon:seedbomb')).toBe('o golpe do slot 2 não pertence ao subconjunto direto compatível');
    });

    it('recusa candidato fora da lista compatível e propaga o bloqueio do indivíduo', () => {
      expect(damageSwapBlocker(individual(), 0, 'cobblemon:unknown-move')).toContain('golpe candidato');
      const hasItem: PlayerIndividual = {...individual(), observed: {...individual().observed, heldItem: 'cobblemon:assault-vest'}};
      expect(damageSwapBlocker(hasItem, 0, 'cobblemon:seedbomb')).toContain('não está no catálogo compatível');
    });
  });

  describe('getDamagePlannerView profile blockers', () => {
    it('bloqueia quando candidateMoveId está vazio', () => {
      const actor = individual();
      const state = createDamagePlannerState({individualUuid: actor.uuid, revision: 1});
      const view = getDamagePlannerView(actor, state);
      expect(view.profileBlocker).toContain('golpe');
    });

    it('bloqueia quando candidateMoveId não pertence aos candidatos', () => {
      const actor = individual();
      let state = createDamagePlannerState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'candidate-selected',
        identity: state.identity,
        candidateMoveId: 'cobblemon:unknown-move',
      });
      const view = getDamagePlannerView(actor, state);
      expect(view.profileBlocker).toContain('golpe');
    });

    it('bloqueia quando speciesId não está no catálogo', () => {
      const actor = individual();
      let state = createDamagePlannerState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'candidate-selected',
        identity: state.identity,
        candidateMoveId: 'cobblemon:seedbomb',
      });
      state = damagePlannerReducer(state, {
        type: 'target-updated',
        identity: state.identity,
        patch: {speciesId: 'cobblemon:unknown-species'},
      });
      const view = getDamagePlannerView(actor, state);
      expect(view.profileBlocker).toContain('espécie');
    });

    it('bloqueia quando level está vazio', () => {
      const actor = individual();
      let state = readyState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'target-updated',
        identity: state.identity,
        patch: {level: ''},
      });
      const view = getDamagePlannerView(actor, state);
      expect(view.profileBlocker).toContain('nível');
    });

    it('bloqueia quando level < 1', () => {
      const actor = individual();
      let state = readyState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'target-updated',
        identity: state.identity,
        patch: {level: '0'},
      });
      const view = getDamagePlannerView(actor, state);
      expect(view.profileBlocker).toContain('nível');
    });

    it('bloqueia quando level > 100', () => {
      const actor = individual();
      let state = readyState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'target-updated',
        identity: state.identity,
        patch: {level: '101'},
      });
      const view = getDamagePlannerView(actor, state);
      expect(view.profileBlocker).toContain('nível');
    });

    it('aceita level 1 e 100', () => {
      const actor = individual();
      let state = readyState({individualUuid: actor.uuid, revision: 1});

      state = damagePlannerReducer(state, {
        type: 'target-updated',
        identity: state.identity,
        patch: {level: '1'},
      });
      const view1 = getDamagePlannerView(actor, state);
      expect(view1.profileBlocker ?? '').not.toContain('nível');

      state = damagePlannerReducer(state, {
        type: 'target-updated',
        identity: state.identity,
        patch: {level: '100'},
      });
      const view2 = getDamagePlannerView(actor, state);
      expect(view2.profileBlocker ?? '').not.toContain('nível');
    });

    it('bloqueia quando nature não pertence às opções mapeadas', () => {
      const actor = individual();
      let state = readyState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'target-updated',
        identity: state.identity,
        patch: {nature: 'invalid:nature'},
      });
      const view = getDamagePlannerView(actor, state);
      expect(view.profileBlocker).toContain('natureza');
    });

    it('bloqueia quando ability não pertence às abilities disponíveis para espécie', () => {
      const actor = individual();
      let state = readyState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'target-updated',
        identity: state.identity,
        patch: {ability: 'cobblemon:trace'},
      });
      const view = getDamagePlannerView(actor, state);
      expect(view.profileBlocker).toContain('habilidade');
    });

    it('bloqueia quando algum IV está vazio ou fora de [0, 31]', () => {
      const actor = individual();
      let state = readyState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'stat-updated',
        identity: state.identity,
        group: 'ivs',
        stat: 'hp',
        value: '',
      });
      expect(getDamagePlannerView(actor, state).profileBlocker).toContain('IV');

      state = damagePlannerReducer(state, {
        type: 'stat-updated',
        identity: state.identity,
        group: 'ivs',
        stat: 'hp',
        value: '32',
      });
      expect(getDamagePlannerView(actor, state).profileBlocker).toContain('IV');
    });

    it('bloqueia quando algum EV está vazio ou fora de [0, 252]', () => {
      const actor = individual();
      let state = readyState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'stat-updated',
        identity: state.identity,
        group: 'evs',
        stat: 'atk',
        value: '',
      });
      expect(getDamagePlannerView(actor, state).profileBlocker).toContain('EV');

      state = damagePlannerReducer(state, {
        type: 'stat-updated',
        identity: state.identity,
        group: 'evs',
        stat: 'atk',
        value: '253',
      });
      expect(getDamagePlannerView(actor, state).profileBlocker).toContain('EV');
    });

    it('bloqueia quando soma de EVs > 510', () => {
      const actor = individual();
      let state = readyState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'stat-updated',
        identity: state.identity,
        group: 'evs',
        stat: 'hp',
        value: '252',
      });
      state = damagePlannerReducer(state, {
        type: 'stat-updated',
        identity: state.identity,
        group: 'evs',
        stat: 'atk',
        value: '252',
      });
      state = damagePlannerReducer(state, {
        type: 'stat-updated',
        identity: state.identity,
        group: 'evs',
        stat: 'def',
        value: '7',
      });
      const view = getDamagePlannerView(actor, state);
      expect(view.profileBlocker).toContain('EVs');
    });

    it('aceita soma de EVs = 510 exatamente', () => {
      const actor = individual();
      let state = readyState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'stat-updated',
        identity: state.identity,
        group: 'evs',
        stat: 'hp',
        value: '252',
      });
      state = damagePlannerReducer(state, {
        type: 'stat-updated',
        identity: state.identity,
        group: 'evs',
        stat: 'atk',
        value: '252',
      });
      state = damagePlannerReducer(state, {
        type: 'stat-updated',
        identity: state.identity,
        group: 'evs',
        stat: 'def',
        value: '6',
      });
      const view = getDamagePlannerView(actor, state);
      expect(view.profileBlocker ?? '').not.toContain('EVs');
    });

    it('rejeita confirmationBlocker quando alguma confirmação é false', () => {
      const actor = individual();
      let state = readyState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'confirmation-updated',
        identity: state.identity,
        key: 'rulesetMatchesActiveWorld',
        checked: false,
      });
      const view = getDamagePlannerView(actor, state);
      expect(view.confirmationBlocker).toBe(true);
    });
  });

  describe('buildRealDamageRequest', () => {
    it('retorna null quando individual é null', () => {
      const actor = individual();
      const state = readyState({individualUuid: actor.uuid, revision: 1});
      expect(buildRealDamageRequest(null, snapshot(actor), state)).toBeNull();
    });

    it('retorna null quando snapshot é null', () => {
      const actor = individual();
      const state = readyState({individualUuid: actor.uuid, revision: 1});
      expect(buildRealDamageRequest(actor, null, state)).toBeNull();
    });

    it('retorna null quando identity.individualUuid não corresponde ao individual.uuid', () => {
      const actor = individual();
      const state = readyState({individualUuid: 'different-uuid', revision: 1});
      expect(buildRealDamageRequest(actor, snapshot(actor), state)).toBeNull();
    });

    it('retorna null quando view não está ready', () => {
      const actor = individual();
      const state = createDamagePlannerState({individualUuid: actor.uuid, revision: 1});
      expect(buildRealDamageRequest(actor, snapshot(actor), state)).toBeNull();
    });

    it('retorna null quando level é null após parse', () => {
      const actor = individual();
      let state = readyState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'target-updated',
        identity: state.identity,
        patch: {level: 'invalid'},
      });
      expect(buildRealDamageRequest(actor, snapshot(actor), state)).toBeNull();
    });

    it('retorna null quando algum IV é null após parse', () => {
      const actor = individual();
      let state = readyState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'stat-updated',
        identity: state.identity,
        group: 'ivs',
        stat: 'atk',
        value: '32',
      });
      expect(buildRealDamageRequest(actor, snapshot(actor), state)).toBeNull();
    });

    it('retorna null quando algum EV é null após parse', () => {
      const actor = individual();
      let state = readyState({individualUuid: actor.uuid, revision: 1});
      state = damagePlannerReducer(state, {
        type: 'stat-updated',
        identity: state.identity,
        group: 'evs',
        stat: 'def',
        value: '253',
      });
      expect(buildRealDamageRequest(actor, snapshot(actor), state)).toBeNull();
    });

    it('mapeia target com todos os seis stats numéricos', () => {
      const actor = individual();
      const state = readyState({individualUuid: actor.uuid, revision: 1});
      const request = buildRealDamageRequest(actor, snapshot(actor), state);

      expect(request?.target.ivs).toEqual({hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31});
      expect(request?.target.evs).toEqual({hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0});
    });

    it('mapeia candidateMoveId corretamente', () => {
      const actor = individual();
      const state = readyState({individualUuid: actor.uuid, revision: 1});
      const request = buildRealDamageRequest(actor, snapshot(actor), state);

      expect(request?.candidateMoveId).toBe('cobblemon:seedbomb');
    });

    it('leva o slot escolhido para o pedido e bloqueia slot com golpe fora do catálogo', () => {
      const actor: PlayerIndividual = {
        ...individual(),
        equippedMoves: [
          {id: 'cobblemon:tackle', pp: 20, ppUps: 0},
          {id: 'cobblemon:unknown-move', pp: 20, ppUps: 0},
        ],
      };
      const identity = {individualUuid: actor.uuid, revision: 1};
      const ready = readyState(identity);
      const chosen = damagePlannerReducer(ready, {type: 'slot-selected', identity, slotIndex: 0});
      expect(buildRealDamageRequest(actor, snapshot(actor), chosen)?.currentSlotIndex).toBe(0);
      const unsupported = damagePlannerReducer(ready, {type: 'slot-selected', identity, slotIndex: 1});
      expect(getDamagePlannerView(actor, unsupported).profileBlocker).toBe('escolha um slot equipado com golpe compatível');
      expect(buildRealDamageRequest(actor, snapshot(actor), unsupported)).toBeNull();
    });

    it('mapeia formId como "normal"', () => {
      const actor = individual();
      const state = readyState({individualUuid: actor.uuid, revision: 1});
      const request = buildRealDamageRequest(actor, snapshot(actor), state);

      expect(request?.target.formId).toBe('normal');
    });

    it('mapeia todas as assumptions como true', () => {
      const actor = individual();
      const state = readyState({individualUuid: actor.uuid, revision: 1});
      const request = buildRealDamageRequest(actor, snapshot(actor), state);

      expect(request?.assumptions.rulesetMatchesActiveWorld).toBe(true);
      expect(request?.assumptions.actorBaselineConfirmed).toBe(true);
      expect(request?.assumptions.actorFullHpConfirmed).toBe(true);
      expect(request?.assumptions.targetBaselineConfirmed).toBe(true);
      expect(request?.assumptions.fieldBaselineConfirmed).toBe(true);
    });

    it('mapeia individualUuid e sources corretamente', () => {
      const actor = individual();
      const state = readyState({individualUuid: actor.uuid, revision: 1});
      const request = buildRealDamageRequest(actor, snapshot(actor), state);

      expect(request?.individualUuid).toBe(actor.uuid);
      expect(request?.sources).toEqual(sourceHashes);
    });
  });

  describe('damagePlannerReducer identity stale checks', () => {
    it('ignora identity-changed quando a nova identity é igual', () => {
      const identity = {individualUuid: 'same', revision: 5};
      let state = readyState(identity);
      const targetBefore = state.target;
      state = damagePlannerReducer(state, {type: 'identity-changed', identity});

      expect(state.target).toBe(targetBefore);
      expect(state.phase).toBe('idle');
    });

    it('reseta confirmações quando identity muda', () => {
      const identity1 = {individualUuid: 'one', revision: 1};
      let state = readyState(identity1);
      const identity2 = {individualUuid: 'two', revision: 1};
      state = damagePlannerReducer(state, {type: 'identity-changed', identity: identity2});

      expect(Object.values(state.confirmations).every((checked) => !checked)).toBe(true);
    });

    it('ignora actions stale quando identity não corresponde', () => {
      const activeIdentity = {individualUuid: 'one', revision: 1};
      const staleIdentity = {individualUuid: 'two', revision: 1};
      let state = readyState(activeIdentity);
      const targetBefore = state.target;

      state = damagePlannerReducer(state, {
        type: 'target-updated',
        identity: staleIdentity,
        patch: {level: '50'},
      });

      expect(state.target).toBe(targetBefore);
    });
  });

  describe('damagePlannerReducer calculation state', () => {
    it('ignora calculation-succeeded com stale requestId', () => {
      const identity = {individualUuid: 'one', revision: 1};
      let state = readyState(identity);
      state = damagePlannerReducer(state, {type: 'calculation-started', identity, requestId: 10});
      const afterStart = state;
      state = damagePlannerReducer(state, {
        type: 'calculation-succeeded',
        identity,
        requestId: 9,
        result: {} as unknown as RealDamageResult,
      });

      expect(state).toBe(afterStart);
      expect(state.phase).toBe('calculating');
    });

    it('ignora calculation-failed com stale requestId', () => {
      const identity = {individualUuid: 'one', revision: 1};
      let state = readyState(identity);
      state = damagePlannerReducer(state, {type: 'calculation-started', identity, requestId: 10});
      const afterStart = state;
      state = damagePlannerReducer(state, {
        type: 'calculation-failed',
        identity,
        requestId: 9,
        error: 'some error',
      });

      expect(state).toBe(afterStart);
      expect(state.phase).toBe('calculating');
    });

    it('clears calculation on candidate-selected', () => {
      const identity = {individualUuid: 'one', revision: 1};
      let state = readyState(identity);
      state = damagePlannerReducer(state, {type: 'calculation-started', identity, requestId: 10});
      state = damagePlannerReducer(state, {type: 'candidate-selected', identity, candidateMoveId: 'cobblemon:tackle'});

      expect(state.phase).toBe('idle');
      expect(state.result).toBeNull();
      expect(state.error).toBeNull();
      expect(state.activeRequestId).toBeNull();
    });

    it('clears calculation on target-updated', () => {
      const identity = {individualUuid: 'one', revision: 1};
      let state = readyState(identity);
      state = damagePlannerReducer(state, {type: 'calculation-started', identity, requestId: 10});
      state = damagePlannerReducer(state, {
        type: 'target-updated',
        identity,
        patch: {level: '26'},
      });

      expect(state.phase).toBe('idle');
      expect(state.result).toBeNull();
    });
  });

  describe('damagePlannerReducer stat-updated', () => {
    it('updates IVs correctly', () => {
      const identity = {individualUuid: 'one', revision: 1};
      let state = createDamagePlannerState(identity);
      state = damagePlannerReducer(state, {
        type: 'stat-updated',
        identity,
        group: 'ivs',
        stat: 'atk',
        value: '25',
      });

      expect(state.target.ivs.atk).toBe('25');
      expect(state.target.ivs.hp).toBe('');
    });

    it('updates EVs correctly', () => {
      const identity = {individualUuid: 'one', revision: 1};
      let state = createDamagePlannerState(identity);
      state = damagePlannerReducer(state, {
        type: 'stat-updated',
        identity,
        group: 'evs',
        stat: 'spa',
        value: '100',
      });

      expect(state.target.evs.spa).toBe('100');
      expect(state.target.evs.def).toBe('');
    });
  });

  describe('bloqueios do indivíduo na visão', () => {
    it('pede um indivíduo quando nenhum está selecionado', () => {
      const state = createDamagePlannerState({individualUuid: null, revision: 1});
      expect(getDamagePlannerView(null, state).blocker).toContain('Selecione um indivíduo');
    });

    it('bloqueia quando o estado pertence a outro UUID, sem reaproveitar o cálculo anterior', () => {
      const actor = individual('individual-two');
      const stale = readyState({individualUuid: 'individual-one', revision: 1});
      const view = getDamagePlannerView(actor, stale);
      expect(view.blocker).toContain('mudou');
      expect(view.ready).toBe(false);
    });

    it('aceita habilidade observada sem o prefixo cobblemon: quando pertence à espécie', () => {
      const gardevoir: PlayerIndividual = {
        ...individual(),
        speciesId: 'cobblemon:gardevoir',
        observed: {...individual().observed, ability: 'synchronize'},
      };
      expect(damageActorBlocker(gardevoir)).toBeNull();
    });

    it('descarta o resultado ao invalidar o cálculo, mantendo slot e candidato', () => {
      const identity = {individualUuid: 'individual-one', revision: 1};
      let state = readyState(identity);
      state = damagePlannerReducer(state, {type: 'slot-selected', identity, slotIndex: 0});
      state = damagePlannerReducer(state, {type: 'calculation-started', identity, requestId: 1});
      const invalidated = damagePlannerReducer(state, {type: 'calculation-invalidated', identity});
      expect(invalidated.phase).toBe('idle');
      expect(invalidated.result).toBeNull();
      expect(invalidated.activeRequestId).toBeNull();
      expect(invalidated.candidateMoveId).toBe('cobblemon:seedbomb');
    });
  });

  describe('opções de espécie e natureza', () => {
    it('lista Gardevoir normal pelo nome e mantém as espécies ordenadas por nome', () => {
      expect(DAMAGE_SPECIES_OPTIONS).toContainEqual({id: 'cobblemon:gardevoir', name: 'Gardevoir'});
      const names = DAMAGE_SPECIES_OPTIONS.map((option) => option.name);
      expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
    });

    it('oferece cada natureza uma vez, com ID namespaced, sem os aliases sem namespace', () => {
      const ids = DAMAGE_NATURE_OPTIONS.map((option) => option.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => id.startsWith('cobblemon:'))).toBe(true);
      expect(DAMAGE_NATURE_OPTIONS).toContainEqual({id: 'cobblemon:modest', name: 'Modest'});
    });
  });

  describe('damageCandidateMoves', () => {
    it('excludes current equipped move', () => {
      const actor = individual();
      const candidates = damageCandidateMoves(actor);

      const hasCurrentMove = candidates.some((m) => m.id === actor.equippedMoves[0]?.id);
      expect(hasCurrentMove).toBe(false);
    });

    it('excludes moves already equipped', () => {
      const actor: PlayerIndividual = {
        ...individual(),
        equippedMoves: [
          {id: 'cobblemon:tackle', pp: 20, ppUps: 0},
          {id: 'cobblemon:seedbomb', pp: 20, ppUps: 0},
        ],
      };
      const candidates = damageCandidateMoves(actor);

      const hasEquipped = candidates.some((m) => m.id === 'cobblemon:seedbomb');
      expect(hasEquipped).toBe(false);
    });

    it('excludes moves not in catalog', () => {
      const actor: PlayerIndividual = {
        ...individual(),
        learnedMoves: [
          {id: 'cobblemon:seedbomb', ppUps: 0},
          {id: 'cobblemon:unknown-move', ppUps: 0},
        ],
      };
      const candidates = damageCandidateMoves(actor);

      const hasUnknown = candidates.some((m) => m.id === 'cobblemon:unknown-move');
      expect(hasUnknown).toBe(false);
    });

    it('excludes duplicate moves by deduplication', () => {
      const actor: PlayerIndividual = {
        ...individual(),
        learnedMoves: [
          {id: 'cobblemon:seedbomb', ppUps: 0},
          {id: 'cobblemon:seedbomb', ppUps: 1},
        ],
      };
      const candidates = damageCandidateMoves(actor);

      const seedbombCount = candidates.filter((m) => m.id === 'cobblemon:seedbomb').length;
      expect(seedbombCount).toBe(1);
    });
  });
});
