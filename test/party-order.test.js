import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {planPartySlots} = require('../electron/lib/guide/party-order.cjs');

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
