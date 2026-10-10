'use strict';

// Fonte única da ordem dos slots da party recomendada. Não pode ser requerido por engine.cjs
// (battle-plan.cjs já requer engine.cjs; seria um ciclo): quem monta o resultado é o worker.
const {buildBattlePlan} = require('./battle-plan.cjs');
const {COMPATIBILITY} = require('../real-damage.cjs');
const {lookup} = require('./opponents.cjs');

const PARTY_SIZE = 6;
const PVE_REASON = 'Objetivo PvE geral: sem treinador para simular, a ordem mantém a sua party.';

function planPartySlots({team, individuals, entryOrder, roles, basis, basisReason}) {
  const party = individuals
    .filter((individual) => individual.location.container === 'party')
    .sort((a, b) => a.location.slot - b.location.slot);
  const currentSlot = new Map(party.map((individual) => [individual.uuid, individual.location.slot]));
  const teamByUuid = new Map(team.map((member) => [member.uuid, member]));

  let ordered;
  if (basis === 'simulação' || basis === 'confronto') {
    const listed = [...new Set(entryOrder.filter((uuid) => teamByUuid.has(uuid)))];
    const seen = new Set(listed);
    const rest = team.filter((member) => !seen.has(member.uuid));
    const inParty = rest.filter((member) => currentSlot.has(member.uuid)).sort((a, b) => currentSlot.get(a.uuid) - currentSlot.get(b.uuid));
    const fromPc = rest.filter((member) => !currentSlot.has(member.uuid));
    ordered = [...listed.map((uuid) => teamByUuid.get(uuid)), ...inParty, ...fromPc];
  } else {
    const positions = new Array(PARTY_SIZE).fill(null);
    const placed = new Set();
    for (const member of team) {
      const slot = currentSlot.get(member.uuid);
      if (slot !== undefined && slot < PARTY_SIZE && positions[slot] === null) {
        positions[slot] = member;
        placed.add(member.uuid);
      }
    }
    const remaining = team.filter((member) => !placed.has(member.uuid));
    for (let index = 0; index < PARTY_SIZE && remaining.length > 0; index += 1)
      if (positions[index] === null) positions[index] = remaining.shift();
    ordered = [...positions.filter((member) => member !== null), ...remaining];
  }

  const slots = ordered.map((member, index) => {
    const fromSlot = currentSlot.get(member.uuid) ?? null;
    return {
      uuid: member.uuid,
      speciesId: member.speciesId,
      fromSlot,
      change: fromSlot === null ? 'entra' : fromSlot === index ? 'mantém' : 'muda de slot',
      replaces: null,
      role: roles[member.uuid] ?? null,
    };
  });
  const toPc = party
    .filter((individual) => !teamByUuid.has(individual.uuid))
    .map((individual) => ({uuid: individual.uuid, speciesId: individual.speciesId, fromSlot: individual.location.slot}));
  const entrants = slots.filter((slot) => slot.change === 'entra');
  for (const [index, slot] of entrants.entries()) {
    const leaving = toPc[index];
    if (leaving) slot.replaces = {uuid: leaving.uuid, speciesId: leaving.speciesId};
  }
  return {basis, basisReason, slots, toPc};
}

function fallbackPlan(result, snapshot, basisReason, byMatchup = false) {
  const opener = byMatchup ? openerByMatchup(result) : null;
  const nameOf = (speciesId) => lookup(COMPATIBILITY.species, speciesId)?.name ?? speciesId;
  return planPartySlots({
    team: result.team,
    individuals: snapshot.individuals,
    entryOrder: opener ? [opener.member.uuid] : [],
    roles: opener ? {[opener.member.uuid]: `Abre a batalha contra ${nameOf(opener.opponentSpeciesId)}`} : {},
    basis: opener ? 'confronto' : 'party atual',
    basisReason,
  });
}

const UNBOUNDED = 1e9;
const finiteTurns = (turns) => (Number.isFinite(turns) ? turns : UNBOUNDED);

/**
 * Quem abre quando a simulação não roda: pelo confronto com o primeiro adversário. Entre os que o derrubam antes, o que
 * precisa de menos turnos (empate: o que aguenta mais turnos, depois a ordem do guia); se ninguém derruba, o de maior
 * diferença entre os turnos do adversário e os seus.
 */
function openerByMatchup(result) {
  const first = result.opponents[0];
  if (!first) return null;
  const rows = result.team.map((member, order) => {
    const matchup = member.matchups.find((candidate) => candidate.opponentId === first.id);
    return {
      member,
      order,
      wins: matchup?.outcome === 'vence',
      ourTurns: finiteTurns(matchup?.ourTurns),
      theirTurns: finiteTurns(matchup?.theirTurns),
    };
  });
  const winners = rows.filter((row) => row.wins);
  const pool = winners.length > 0 ? winners : rows;
  pool.sort((a, b) =>
    winners.length > 0
      ? a.ourTurns - b.ourTurns || b.theirTurns - a.theirTurns || a.order - b.order
      : b.theirTurns - b.ourTurns - (a.theirTurns - a.ourTurns) || a.order - b.order,
  );
  return {member: pool[0].member, opponentSpeciesId: first.speciesId};
}

function rolesOf(steps, team) {
  const nameOf = (speciesId) => lookup(COMPATIBILITY.species, speciesId)?.name ?? speciesId;
  const template = {
    lead: (name) => `Abre a batalha contra ${name}`,
    troca: (name) => `Entra na troca contra ${name}`,
    'após KO': (name) => `Entra quando o anterior cai, contra ${name}`,
  };
  const roles = {};
  for (const step of steps) {
    if (roles[step.memberUuid] !== undefined) continue;
    const build = template[step.entry];
    if (build) roles[step.memberUuid] = build(nameOf(step.opponentSpeciesId));
  }
  for (const member of team) roles[member.uuid] ??= 'Reserva: não entra na batalha simulada';
  return roles;
}

async function withPartyPlan({result, snapshot, data, levelCap, respectLevelCap, checkpoint}) {
  const finish = (partyPlan) => {
    const index = new Map(partyPlan.slots.map((slot, position) => [slot.uuid, position]));
    return {...result, team: [...result.team].sort((a, b) => index.get(a.uuid) - index.get(b.uuid)), partyPlan};
  };
  if (result.team.length === 0) return finish(fallbackPlan(result, snapshot, null));
  if (result.goal.kind !== 'trainer') return finish(fallbackPlan(result, snapshot, PVE_REASON));

  const request = {
    sources: [],
    trainerId: result.goal.trainerId,
    team: result.team.map((member) => ({
      uuid: member.uuid,
      moveIds: member.moves.filter((move) => move.evaluated).map((move) => move.id),
      itemId: member.item.status === 'nenhum' ? null : member.item.id,
    })),
    levelCap,
    respectLevelCap,
  };
  let plan;
  try {
    plan = await buildBattlePlan({snapshot, data, request, checkpoint});
  } catch (error) {
    if (error?.code === 'CANCELLED') throw error;
    return finish(fallbackPlan(result, snapshot, `O plano de batalha não pôde ser montado (${error?.message ?? error}).`, true));
  }
  if (plan.status === 'fora-do-escopo') return finish(fallbackPlan(result, snapshot, 'Batalha em dupla: a ordem mantém a sua party.'));
  const steps = plan.simulation?.steps ?? [];
  if (steps.length === 0) {
    return finish(fallbackPlan(result, snapshot, `Simulação interrompida (${plan.simulation?.stopReason}).`, true));
  }
  return finish(
    planPartySlots({
      team: result.team,
      individuals: snapshot.individuals,
      entryOrder: steps.map((step) => step.memberUuid),
      roles: rolesOf(steps, result.team),
      basis: 'simulação',
      basisReason: null,
    }),
  );
}

module.exports = {planPartySlots, withPartyPlan};
