'use strict';

const calc = require('@smogon/calc');
const {damageRange, pokemonFromSpec} = require('../calc-profile.cjs');
const {COMPATIBILITY, baseActorProfile} = require('../real-damage.cjs');
const {averagePercent, effectiveSpeed, matchupOutcome} = require('./engine.cjs');
const {lookup, namedFromCatalog} = require('./opponents.cjs');

const generation = calc.Generations.get(9);
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const MAX_TEAM = 6;
const MAX_MOVES = 4;
const DOUBLES_REASON = 'batalha em dupla, fora do escopo';
const LIMITS = Object.freeze([
  'Singles; sem simulação de turnos, IA do RCT nem golpes de status; HP e PP cheios; sem status; campo neutro; sem críticos ou precisão.',
  'O plano mostra números e riscos declarados; não estima chance de resultado.',
]);

// Habilidades que mudam o campo ou o confronto na entrada: o adaptador não as modela, então o confronto é bloqueado.
const UNSUPPORTED_ABILITIES = Object.freeze({
  electricsurge: 'terreno elétrico',
  grassysurge: 'terreno de grama',
  mistysurge: 'terreno enevoado',
  psychicsurge: 'terreno psíquico',
  hadronengine: 'terreno elétrico',
  seedsower: 'terreno de grama',
  drought: 'sol forte',
  orichalcumpulse: 'sol forte',
  drizzle: 'chuva',
  sandstream: 'tempestade de areia',
  snowwarning: 'neve',
  desolateland: 'sol extremamente forte',
  primordialsea: 'mar primordial',
  deltastream: 'correntes de ar',
  intimidate: 'queda de Ataque na entrada',
  download: 'aumento de atributo na entrada',
  trace: 'cópia de habilidade',
  imposter: 'transformação',
  neutralizinggas: 'supressão de habilidades',
});
const IMMUNITY_ABILITIES = Object.freeze({
  voltabsorb: 'Electric',
  lightningrod: 'Electric',
  motordrive: 'Electric',
  flashfire: 'Fire',
  waterabsorb: 'Water',
  stormdrain: 'Water',
  dryskin: 'Water',
  sapsipper: 'Grass',
  levitate: 'Ground',
  eartheater: 'Ground',
});
const HEAL_ITEMS = Object.freeze({
  'cobblemon:berry_juice': 'recupera 20 HP quando o HP cai a 1/2 ou menos',
  'cobblemon:oran_berry': 'recupera 10 HP quando o HP cai a 1/2 ou menos',
  'cobblemon:sitrus_berry': 'recupera 1/4 do HP máximo quando o HP cai a 1/2 ou menos',
  'cobblemon:leftovers': 'recupera 1/16 do HP máximo por turno',
});
const SPEED_ITEMS = Object.freeze(['cobblemon:choice_scarf', 'cobblemon:quick_claw', 'cobblemon:custap_berry']);

function titleCase(id) {
  return id
    .replace(/^[^:]+:/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
const speciesName = (speciesId) => lookup(COMPATIBILITY.species, speciesId)?.name ?? titleCase(speciesId);

function itemKey(itemId) {
  if (typeof itemId !== 'string' || !itemId.startsWith('cobblemon:')) return null;
  const key = itemId.slice('cobblemon:'.length).replace(/_/g, '');
  return Object.hasOwn(COMPATIBILITY.items, key) ? key : null;
}
const itemLabel = (itemId) => {
  const key = itemKey(itemId);
  return key ? COMPATIBILITY.items[key].name : titleCase(itemId);
};
const itemCalcName = (itemId) => {
  const key = itemKey(itemId);
  return key ? COMPATIBILITY.items[key].name : '';
};
const joinOr = (items) => (items.length <= 2 ? items.join(' ou ') : `${items.slice(0, -1).join(', ')} ou ${items.at(-1)}`);

function calcMove(moveId) {
  return generation.moves.get(calc.toID(moveId.replace(/^[^:]+:/, '')));
}
const priorityOf = (moveId) => calcMove(moveId)?.priority ?? 0;

// --- Time do jogador ---------------------------------------------------------------------------------------------

function buildTeam(request, individuals) {
  const members = request.team;
  if (!Array.isArray(members) || members.length < 1 || members.length > MAX_TEAM) {
    throw new Error(`o time precisa ter de 1 a ${MAX_TEAM} membros`);
  }
  const seen = new Set();
  return members.map((member) => {
    if (seen.has(member.uuid)) throw new Error(`membro repetido no time: ${member.uuid}`);
    seen.add(member.uuid);
    const individual = individuals.find((candidate) => candidate.uuid === member.uuid);
    if (!individual) throw new Error(`membro ${member.uuid} não está no snapshot atual`);
    let profile;
    try {
      profile = baseActorProfile(individual);
    } catch (error) {
      throw new Error(`membro ${member.uuid} não é elegível: ${error.message.replace(/^Cálculo real: /, '')}`);
    }
    const moveIds = [...new Set(member.moveIds ?? [])].filter((id) => Object.hasOwn(COMPATIBILITY.moves, id)).slice(0, MAX_MOVES);
    if (moveIds.length === 0) throw new Error(`membro ${member.uuid} não tem golpes do catálogo compatível`);
    const pokemon = pokemonFromSpec({...profile, item: itemCalcName(member.itemId)});
    return {uuid: member.uuid, speciesId: individual.speciesId, pokemon, moveIds};
  });
}

// --- Adversário --------------------------------------------------------------------------------------------------

/** Constrói o adversário ou lista o que bloqueia este confronto. IV ausente vale 31 e EV ausente vale 0. */
function buildOpponent(member, index, trainerId) {
  const blockers = [];
  const species = lookup(COMPATIBILITY.species, member.speciesId);
  const label = speciesName(member.speciesId);
  if (!species) blockers.push(`espécie ${label} fora do catálogo compatível`);
  if (member.aspects?.length > 0) blockers.push(`forma alternativa (${member.aspects.join(', ')}) fora do catálogo compatível`);
  const ability = namedFromCatalog(COMPATIBILITY.abilities, member.ability);
  if (!ability) blockers.push(`habilidade ${member.ability} fora do catálogo compatível`);
  const unsupportedField = UNSUPPORTED_ABILITIES[member.ability];
  if (unsupportedField) blockers.push(`habilidade ${ability ?? member.ability}: ${unsupportedField}, fora do adaptador`);
  const nature = namedFromCatalog(COMPATIBILITY.natures, member.nature);
  if (!nature) blockers.push(`natureza ${member.nature} fora do catálogo compatível`);
  const alternatives = Array.isArray(member.heldItem) ? member.heldItem : member.heldItem ? [member.heldItem] : [];
  const modded = alternatives.find((id) => id.startsWith('mega_showdown:'));
  if (modded) blockers.push(`${itemLabel(modded)}: Mega Evolução ou Cristal Z, fora do adaptador`);
  const moves = [];
  for (const moveId of member.moves ?? []) {
    if (Object.hasOwn(COMPATIBILITY.moves, moveId)) moves.push({id: moveId, name: COMPATIBILITY.moves[moveId].name});
    else if (calcMove(moveId)?.category && calcMove(moveId).category !== 'Status') {
      blockers.push(`golpe de dano ${calcMove(moveId).name} fora do catálogo compatível`);
    } else if (!calcMove(moveId)) blockers.push(`golpe ${titleCase(moveId)} desconhecido`);
  }
  const base = {
    id: `${trainerId}#${index}`,
    speciesId: member.speciesId,
    level: member.level,
    abilityId: member.ability,
    alternatives,
    moves,
    label,
    pokemon: null,
    blockers,
  };
  if (blockers.length > 0) return base;
  const ivs = Object.fromEntries(STATS.map((stat) => [stat, member.ivs?.[stat] ?? 31]));
  const evs = Object.fromEntries(STATS.map((stat) => [stat, member.evs?.[stat] ?? 0]));
  // Com mais de uma alternativa o item é desconhecido: o cálculo não escolhe e o plano avisa.
  const item = alternatives.length === 1 ? itemCalcName(alternatives[0]) : '';
  try {
    base.pokemon = pokemonFromSpec({species, level: member.level, nature, ability, ivs, evs, item});
  } catch (error) {
    base.blockers.push(`o motor de cálculo recusou o adversário (${error.message})`);
  }
  return base;
}

function opponentRisks(opponent, dealt, firstToAct) {
  const risks = [];
  const {alternatives, label} = opponent;
  const multi = alternatives.length > 1;
  const hedge = (id) => (multi ? ` (se segurar ${itemLabel(id)})` : '');
  const sturdy = opponent.abilityId === 'sturdy';
  const sash = alternatives.includes('cobblemon:focus_sash');
  const custap = alternatives.includes('cobblemon:custap_berry');
  if (sturdy || sash) {
    const source = sturdy ? 'Sturdy' : `Focus Sash${hedge('cobblemon:focus_sash')}`;
    const tail = custap ? ` e pode agir antes com Custap Berry${hedge('cobblemon:custap_berry')}` : '';
    risks.push({kind: sturdy ? 'habilidade' : 'item', text: `${label} aguenta um golpe com ${source}${tail}.`});
  } else if (custap) {
    risks.push({
      kind: 'item',
      text: `${label} pode agir antes com Custap Berry${hedge('cobblemon:custap_berry')} quando o HP cair a 1/4 ou menos.`,
    });
  }
  for (const id of alternatives) {
    const effect = lookup(HEAL_ITEMS, id);
    if (effect)
      risks.push({
        kind: 'item',
        text: `${label} pode curar com ${itemLabel(id)}${hedge(id)}: ${effect}. A cura não entra nos números do plano.`,
      });
  }
  if (multi) {
    risks.push({
      kind: 'item',
      text: `${label} pode segurar ${joinOr(alternatives.map(itemLabel))}: o plano não escolhe um item, e o dano recebido não conta o item do adversário.`,
    });
  }
  const immunity = lookup(IMMUNITY_ABILITIES, opponent.abilityId);
  if (immunity && dealt && dealt.max === 0) {
    risks.push({kind: 'habilidade', text: `${label} anula golpes do tipo ${immunity} com ${titleCase(opponent.abilityId)}.`});
  }
  if (firstToAct === 'incerto' && alternatives.some((id) => SPEED_ITEMS.includes(id)) && risks.length === 0) {
    risks.push({kind: 'item', text: `${label} pode alterar a ordem de ação com o item.`});
  }
  return risks;
}

// --- Confrontos --------------------------------------------------------------------------------------------------

function bestDamaging(attacker, defender, moves) {
  let best = null;
  for (const move of moves) {
    const percent = averagePercent(attacker, defender, move.name);
    if (!best || percent > best.percent) best = {...move, percent};
  }
  return best;
}

function evaluateMember(member, opponent) {
  const ours = bestDamaging(
    member.pokemon,
    opponent.pokemon,
    member.moveIds.map((id) => ({id, name: COMPATIBILITY.moves[id].name})),
  );
  const theirs = bestDamaging(opponent.pokemon, member.pokemon, opponent.moves);
  const outcome = matchupOutcome(
    ours?.percent ?? 0,
    theirs?.percent ?? 0,
    effectiveSpeed(member.pokemon),
    effectiveSpeed(opponent.pokemon),
  );
  return {member, ours, theirs, outcome};
}

function compareEvaluations(left, right) {
  const margin = (evaluation) => {
    const {ourTurns, theirTurns} = evaluation.outcome;
    return ourTurns === theirTurns ? 0 : theirTurns - ourTurns;
  };
  const leftMargin = margin(left);
  const rightMargin = margin(right);
  return (
    right.outcome.score - left.outcome.score ||
    (Number.isNaN(rightMargin - leftMargin) ? 0 : rightMargin - leftMargin) ||
    (left.member.uuid < right.member.uuid ? -1 : 1)
  );
}

function actOrder(evaluation, opponent) {
  const {member, ours, theirs} = evaluation;
  const ourPriority = priorityOf(ours.id);
  const theirPriority = theirs ? priorityOf(theirs.id) : 0;
  const ourSpeed = effectiveSpeed(member.pokemon);
  const theirSpeed = effectiveSpeed(opponent.pokemon);
  const ourName = speciesName(member.speciesId);
  let first;
  let reason;
  if (ourPriority !== theirPriority) {
    first = ourPriority > theirPriority ? 'jogador' : 'adversário';
    const mover = first === 'jogador' ? ours : theirs;
    const priority = Math.max(ourPriority, theirPriority);
    reason = `${mover.name} tem prioridade ${priority > 0 ? '+' : ''}${priority}.`;
  } else if (ourSpeed === theirSpeed) {
    first = 'incerto';
    reason = `${ourName} e ${opponent.label} têm a mesma Speed (${ourSpeed}); a ordem é sorteada.`;
  } else {
    first = ourSpeed > theirSpeed ? 'jogador' : 'adversário';
    reason = `${ourName} tem Speed ${ourSpeed} e ${opponent.label} tem ${theirSpeed}.`;
  }
  // Choice Scarf como única alternativa já entra na Speed do cálculo; os demais itens de ordem só aparecem como risco.
  const scarfAlone = opponent.alternatives.length === 1 && opponent.alternatives[0] === 'cobblemon:choice_scarf';
  const speedItems = scarfAlone ? [] : opponent.alternatives.filter((id) => SPEED_ITEMS.includes(id));
  if (first === 'jogador' && speedItems.length > 0) {
    first = 'incerto';
    reason += ` ${opponent.label} pode agir antes com ${joinOr(speedItems.map(itemLabel))}.`;
  }
  return {first, reason};
}

function planEntry(opponent, team, trainerId) {
  const header = {
    opponentId: opponent.id,
    speciesId: opponent.speciesId,
    level: opponent.level,
    ability: opponent.abilityId,
    heldItemAlternatives: [...opponent.alternatives],
  };
  if (opponent.blockers.length > 0) {
    return {
      ...header,
      status: 'bloqueado',
      blockedReason: opponent.blockers.join('; '),
      responder: null,
      dealt: null,
      received: null,
      firstToAct: null,
      actReason: null,
      risks: opponentRisks(opponent, null, null),
      evaluation: null,
      trainerId,
    };
  }
  const evaluations = team.map((member) => evaluateMember(member, opponent)).sort(compareEvaluations);
  const best = evaluations[0];
  const dealt = {moveId: best.ours.id, ...damageRange(best.member.pokemon, opponent.pokemon, best.ours.name)};
  const received = best.theirs ? {moveId: best.theirs.id, ...damageRange(opponent.pokemon, best.member.pokemon, best.theirs.name)} : null;
  const order = actOrder(best, opponent);
  return {
    ...header,
    status: 'planejado',
    blockedReason: null,
    responder: {uuid: best.member.uuid, speciesId: best.member.speciesId, moveId: best.ours.id},
    dealt,
    received,
    firstToAct: order.first,
    actReason: order.reason,
    risks: opponentRisks(opponent, dealt, order.first),
    evaluation: best,
    trainerId,
  };
}

function trainerRisks(trainer) {
  const risks = [];
  const bag = (trainer.bag ?? []).map((entry) => ({itemId: entry.item, quantity: entry.quantity}));
  const maxItemUses = trainer.battleRules?.maxItemUses ?? null;
  if (bag.length > 0) {
    const list = bag.map((entry) => `${entry.quantity} ${itemLabel(entry.itemId)}`).join(', ');
    const limit = maxItemUses === null ? 'sem limite de usos declarado' : `até ${maxItemUses} usos de item na luta (maxItemUses)`;
    risks.push({kind: 'bolsa', text: `A bolsa do treinador tem ${list}, ${limit}. A cura não entra nos números do plano.`});
  }
  if (trainer.ai?.type === 'rct') {
    const margin = trainer.ai.data?.maxSelectMargin;
    const detail = margin === undefined ? '' : ` (margem de escolha ${margin})`;
    risks.push({kind: 'ia', text: `A IA do RCT não é modelada${detail}: o adversário pode não usar o golpe de maior dano.`});
  }
  return {bag, maxItemUses, risks};
}

function pickLead(entries, team) {
  const first = entries.find((entry) => entry.status === 'planejado');
  if (!first) return null;
  const planned = entries.filter((entry) => entry.status === 'planejado');
  const advantages = (uuid) => planned.filter((entry) => entry.evaluation.member.uuid === uuid && entry.evaluation.outcome.wins).length;
  const member = team.find((candidate) => candidate.uuid === first.responder.uuid);
  const wins = advantages(member.uuid);
  return {
    uuid: member.uuid,
    speciesId: member.speciesId,
    reason: `${speciesName(member.speciesId)} abre porque é o melhor respondedor ao primeiro adversário do plano (${speciesName(first.speciesId)}) e responde com vantagem de turnos a ${wins} de ${planned.length} adversários planejados.`,
  };
}

/**
 * Plano de batalha contra um treinador singles: respondedor, golpe, dano nos dois sentidos, ordem de ação e riscos
 * declarados por adversário. Não simula turnos nem estima chance de resultado.
 */
async function buildBattlePlan({snapshot, request, data, checkpoint = async () => {}}) {
  const trainer = data.trainers.find((candidate) => candidate.id === request.trainerId);
  if (!trainer) throw new Error(`treinador ${request.trainerId} não encontrado`);
  const {bag, maxItemUses, risks} = trainerRisks(trainer);
  const header = {trainer: {id: trainer.id, name: trainer.name, maxItemUses, bag}, trainerRisks: risks, limits: [...LIMITS]};
  if (trainer.format !== 'singles') {
    return {
      ...header,
      trainerRisks: [],
      status: 'fora-do-escopo',
      scopeReason: DOUBLES_REASON,
      lead: null,
      entries: [],
      assumptions: [],
    };
  }
  const team = buildTeam(request, snapshot.individuals);
  const assumptions = [
    'Hipóteses: HP e PP cheios, sem status, campo neutro e sem críticos; a IA do RCT não é modelada.',
    'O time usa os golpes e o item recomendados pelo guia; o app não verifica se você tem os itens.',
    'O item do adversário só entra no dano quando a definição tem uma única alternativa no catálogo; golpes de status são ignorados.',
  ];
  const entries = [];
  for (const [index, member] of trainer.team.entries()) {
    await checkpoint();
    entries.push(planEntry(buildOpponent(member, index, trainer.id), team, trainer.id));
  }
  const lead = pickLead(entries, team);
  const blocked = entries.filter((entry) => entry.status === 'bloqueado').length;
  if (blocked > 0)
    assumptions.push(`${blocked} de ${entries.length} adversário(s) ficaram sem plano por mecânica fora do catálogo ou do adaptador.`);
  return {
    ...header,
    status: 'plano',
    scopeReason: null,
    lead,
    entries: entries.map(({evaluation: _evaluation, trainerId: _trainerId, ...entry}) => entry),
    assumptions,
  };
}

module.exports = {buildBattlePlan};
