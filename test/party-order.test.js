import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {planPartySlots, withPartyPlan} = require('../electron/lib/guide/party-order.cjs');

const member = (uuid) => ({uuid, speciesId: `cobblemon:${uuid}`});
const party = (uuid, slot) => ({...member(uuid), location: {container: 'party', slot}});
const pc = (uuid) => ({...member(uuid), location: {container: 'pc', box: 0, boxName: null, slot: 0}});

describe('planPartySlots', () => {
  const individuals = [party('A', 0), party('B', 1), party('C', 2), party('D', 3), pc('E'), pc('F')];
  const team = ['E', 'A', 'C', 'F'].map(member);

  it('simulação: segue a ordem de entrada e marca quem entra no lugar de quem vai ao PC', () => {
    const plan = planPartySlots({team, individuals, entryOrder: ['E', 'A', 'F'], roles: {}, basis: 'simulação', basisReason: null});
    expect(plan.slots.map((slot) => slot.uuid)).toEqual(['E', 'A', 'F', 'C']);
    expect(plan.slots.map((slot) => slot.change)).toEqual(['entra', 'muda de slot', 'entra', 'muda de slot']);
    expect(plan.slots[0].replaces?.uuid).toBe('B');
    expect(plan.slots[2].replaces?.uuid).toBe('D');
    expect(plan.toPc.map((entry) => entry.uuid)).toEqual(['B', 'D']);
  });

  it('party atual: quem já está na party mantém o slot e os entrantes preenchem os vazios', () => {
    const plan = planPartySlots({team, individuals, entryOrder: [], roles: {}, basis: 'party atual', basisReason: 'x'});
    expect(plan.slots.map((slot) => slot.uuid)).toEqual(['A', 'E', 'C', 'F']);
    expect(plan.slots.map((slot) => slot.change)).toEqual(['mantém', 'entra', 'mantém', 'entra']);
  });

  it('entrante sem ninguém para substituir ocupa espaço livre', () => {
    const plan = planPartySlots({
      team: ['A', 'E', 'F', 'G'].map(member),
      individuals: [party('A', 0), party('B', 1), party('C', 2), pc('E'), pc('F'), pc('G')],
      entryOrder: [],
      roles: {},
      basis: 'party atual',
      basisReason: null,
    });
    const entrants = plan.slots.filter((slot) => slot.change === 'entra');
    expect(entrants.map((slot) => slot.replaces?.uuid ?? null)).toEqual(['B', 'C', null]);
  });
});

describe('ordem pelo confronto quando a simulação não roda', () => {
  const teamMember = (uuid, outcome, ourTurns, theirTurns) => ({
    ...member(uuid),
    moves: [],
    item: {status: 'nenhum'},
    matchups: [{opponentId: 'o0', outcome, ourTurns, theirTurns, moveId: null}],
  });

  it('abre quem derruba o primeiro adversário em menos turnos', async () => {
    const result = {
      goal: {kind: 'trainer', trainerId: 'synthetic:x'},
      opponents: [{id: 'o0', speciesId: 'cobblemon:geodude'}],
      team: [teamMember('A', 'vence', 2, 3), teamMember('B', 'vence', 1, 2), teamMember('C', 'perde', Number.POSITIVE_INFINITY, 1)],
    };
    const snapshot = {individuals: [party('A', 0), party('B', 1), party('C', 2)]};
    // O treinador não existe nos dados: o plano de batalha falha e a ordem cai no confronto.
    const planned = await withPartyPlan({
      result,
      snapshot,
      data: {trainers: []},
      levelCap: null,
      respectLevelCap: true,
      checkpoint: async () => {},
    });
    expect(planned.partyPlan.basis).toBe('confronto');
    expect(planned.partyPlan.slots.map((slot) => slot.uuid)).toEqual(['B', 'A', 'C']);
    expect(planned.partyPlan.slots[0].role).toBe('Abre a batalha contra Geodude');
    expect(planned.team.map((m) => m.uuid)).toEqual(['B', 'A', 'C']);
  });

  it('sem ninguém que derrube, abre quem aguenta mais turnos em relação ao que precisa', async () => {
    const result = {
      goal: {kind: 'trainer', trainerId: 'synthetic:x'},
      opponents: [{id: 'o0', speciesId: 'cobblemon:geodude'}],
      team: [teamMember('A', 'perde', 5, 2), teamMember('B', 'perde', 4, 3)],
    };
    const snapshot = {individuals: [party('A', 0), party('B', 1)]};
    const planned = await withPartyPlan({
      result,
      snapshot,
      data: {trainers: []},
      levelCap: null,
      respectLevelCap: true,
      checkpoint: async () => {},
    });
    expect(planned.partyPlan.slots[0].uuid).toBe('B');
  });
});
