'use strict';

const calc = require('@smogon/calc');
const {COMPATIBILITY} = require('../real-damage.cjs');
const {knownMoves} = require('./eligibility.cjs');
const {lookup} = require('./opponents.cjs');

const generation = calc.Generations.get(9);
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const MAX_TEAM = 6;
const EV_STAT_MAX = 252;
const EV_TOTAL_MAX = 510;
const LIMITS = Object.freeze([
  'O nível-alvo nunca passa do level cap informado; sem cap, não há nível-alvo.',
  'Não lê inventário (vitaminas, itens de EV, bottle caps) nem a experiência atual: esforço de subida não é estimado.',
  'Os golpes consideram só o aprendizado por nível da espécie atual, sem evolução.',
]);
const NO_YIELD_REASON = 'o rendimento de EV por espécie (evYield) ainda não está nos dados do jogo, então não há espécies para treinar EVs';

const slugOf = (speciesId) => speciesId.replace(/^[^:]+:/, '');

/** Papel do membro: ataque pelo lado em que seus golpes e atributos mais pesam, velocidade ou resistência. */
function roleOf(individual, known) {
  const species = generation.species.get(calc.toID(lookup(COMPATIBILITY.species, individual.speciesId)?.name ?? ''));
  if (!species) return null;
  const base = species.baseStats;
  let physical = 0;
  let special = 0;
  for (const id of [...known.equipped, ...known.learned]) {
    if (!Object.hasOwn(COMPATIBILITY.moves, id)) continue;
    const category = generation.moves.get(calc.toID(COMPATIBILITY.moves[id].name))?.category;
    if (category === 'Physical') physical += 1;
    else if (category === 'Special') special += 1;
  }
  const side = physical !== special ? (physical > special ? 'atk' : 'spa') : base.atk >= base.spa ? 'atk' : 'spa';
  const offense = base[side];
  const bulk = base.hp + base.def + base.spd;
  let role;
  if (bulk >= 3 * offense) role = 'resistência';
  else if (base.spe >= 110 && base.spe >= offense) role = 'velocidade';
  else role = side === 'atk' ? 'atacante-físico' : 'atacante-especial';
  return {role, side, base};
}

function targetEvs(role, side, base) {
  if (role === 'resistência')
    return base.def >= base.spd ? {hp: EV_STAT_MAX, def: EV_STAT_MAX, spd: 6} : {hp: EV_STAT_MAX, spd: EV_STAT_MAX, def: 6};
  if (role === 'velocidade') return {spe: EV_STAT_MAX, [side]: EV_STAT_MAX, hp: 6};
  return {[side]: EV_STAT_MAX, spe: EV_STAT_MAX, hp: 6};
}

function currentEvsOf(individual) {
  const current = {};
  let unknown = false;
  for (const stat of STATS) {
    const fact = individual.battleStats?.evs?.[stat];
    if (fact?.state === 'known' && Number.isSafeInteger(fact.value)) current[stat] = fact.value;
    else {
      current[stat] = null;
      unknown = true;
    }
  }
  return {current, unknown};
}

function evPlanOf(individual, known) {
  const profile = roleOf(individual, known);
  const {current, unknown} = currentEvsOf(individual);
  if (!profile) {
    return {
      role: 'atacante-físico',
      status: 'não-determinado',
      reason: 'espécie sem dados de atributos base: o papel não pode ser determinado',
      currentEvs: current,
      suggestedEvs: {},
      sources: [],
    };
  }
  const {role, side, base} = profile;
  if (unknown) {
    return {
      role,
      status: 'não-determinado',
      reason: 'algum EV atual não foi capturado; desconhecido não vira zero, então não há distribuição fechada',
      currentEvs: current,
      suggestedEvs: {},
      sources: [],
    };
  }
  const suggested = targetEvs(role, side, base);
  const total = Object.values(suggested).reduce((sum, value) => sum + value, 0);
  if (total > EV_TOTAL_MAX || Object.values(suggested).some((value) => value > EV_STAT_MAX))
    throw new Error('distribuição de EVs fora dos limites');
  const missing = Object.entries(suggested).filter(([stat, value]) => current[stat] < value);
  const reached = missing.length === 0;
  const names = {hp: 'HP', atk: 'Ataque', def: 'Defesa', spa: 'Ataque Especial', spd: 'Defesa Especial', spe: 'Velocidade'};
  const list = Object.entries(suggested)
    .map(([stat, value]) => `${value} em ${names[stat]}`)
    .join(', ');
  return {
    role,
    status: 'sugerido',
    reason: `${reached ? 'EVs já atingem a sugestão' : 'Sugestão'} para o papel ${role}: ${list}; ${NO_YIELD_REASON}.`,
    currentEvs: current,
    suggestedEvs: suggested,
    sources: [],
  };
}

function movesOnTheWay(learnsets, individual, target, useful) {
  const output = [];
  const seen = new Set();
  for (const move of lookup(learnsets, slugOf(individual.speciesId))?.levelUp ?? []) {
    if (move.level <= individual.level || move.level > target || seen.has(move.moveId)) continue;
    const isUseful = useful.has(move.moveId);
    if (!isUseful && !Object.hasOwn(COMPATIBILITY.moves, move.moveId)) continue;
    seen.add(move.moveId);
    output.push({moveId: move.moveId, level: move.level, useful: isUseful});
  }
  return output.sort((left, right) => left.level - right.level || (left.moveId < right.moveId ? -1 : 1));
}

function memberPlan(individual, useful, levelCap, capOrigin, data) {
  const known = knownMoves(individual);
  const base = {uuid: individual.uuid, speciesId: individual.speciesId, level: individual.level, levelCap, capOrigin};
  const evs = evPlanOf(individual, known);
  if (!Number.isSafeInteger(individual.level)) {
    return {...base, targetLevel: null, targetNote: 'nível não capturado', moves: [], evs};
  }
  if (levelCap === null) return {...base, targetLevel: null, targetNote: 'cap não determinado', moves: [], evs};
  if (individual.level >= levelCap) {
    return {...base, targetLevel: individual.level, targetNote: `já no cap ${levelCap}; não suba mais`, moves: [], evs};
  }
  return {
    ...base,
    targetLevel: levelCap,
    targetNote: `subir do nível ${individual.level} até o cap ${levelCap} (informado)`,
    moves: movesOnTheWay(data.learnsets, individual, levelCap, useful),
    evs,
  };
}

/**
 * Treino até o level cap: nível-alvo (nunca acima do cap), golpes por nível no caminho e EVs coerentes com o papel.
 * Cap desconhecido não gera alvo; EV desconhecido não vira zero.
 */
async function buildTrainingPlan({snapshot, request, data, checkpoint = async () => {}}) {
  const team = request.team;
  if (!Array.isArray(team) || team.length < 1 || team.length > MAX_TEAM) throw new Error(`o time precisa ter de 1 a ${MAX_TEAM} membros`);
  const levelCap = request.levelCap ?? null;
  if (levelCap !== null && !(Number.isSafeInteger(levelCap) && levelCap >= 1 && levelCap <= 100))
    throw new Error('levelCap precisa ser inteiro de 1 a 100 ou nulo');
  const capOrigin = request.capOrigin;
  if (capOrigin !== 'informado' && capOrigin !== 'desconhecida') throw new Error('capOrigin inválido');
  if ((capOrigin === 'informado') !== (levelCap !== null)) throw new Error('capOrigin e levelCap não combinam');
  const seen = new Set();
  const members = [];
  for (const member of team) {
    await checkpoint();
    if (seen.has(member.uuid)) throw new Error(`membro repetido no time: ${member.uuid}`);
    seen.add(member.uuid);
    const individual = snapshot.individuals.find((candidate) => candidate.uuid === member.uuid);
    if (!individual) throw new Error(`membro ${member.uuid} não está no snapshot atual`);
    members.push(memberPlan(individual, new Set(member.usefulMoveIds ?? []), levelCap, capOrigin, data));
  }
  return {
    members,
    assumptions: [
      'O papel de cada membro vem dos atributos base e dos golpes que ele conhece (físicos contra especiais).',
      'EVs sugeridos são o total desejado por atributo (252 por atributo, 510 no total), não o que falta somar.',
      'Os golpes marcados como úteis são os que o guia recomendou para o objetivo.',
    ],
    limits: [...LIMITS],
  };
}

module.exports = {buildTrainingPlan};
