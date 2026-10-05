'use strict';

const calc = require('@smogon/calc');
const {COMPATIBILITY} = require('../real-damage.cjs');
const {knownMoves} = require('./eligibility.cjs');
const {lookup} = require('./opponents.cjs');

const generation = calc.Generations.get(9);
const MAX_TEAM = 6;
const LIMITS = Object.freeze([
  'Mega e outras formas de batalha não são evolução e ficam de fora.',
  'Só a forma normal tem dados de evolução e de golpes; forma regional fica bloqueada até haver dados por forma.',
  'Amizade, item de evolução, horário, bioma e troca não vêm do save: aparecem como não verificados.',
]);

function titleCase(id) {
  return id
    .replace(/^[^:]+:/, '')
    .replace(/[_#:-]+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
const moveLabel = (moveId) => lookup(COMPATIBILITY.moves, moveId)?.name ?? titleCase(moveId);
const slugOf = (speciesId) => speciesId.replace(/^[^:]+:/, '');

/** `nome(chave=valor chave2=valor2)` em partes. Sem parênteses, `nome=valor` (requiredContext). */
function parsePart(part) {
  const call = part.match(/^([a-z_]+)\((.*)\)$/);
  if (call) {
    const args = {};
    for (const pair of call[2].split(/ (?=[A-Za-z]+=)/)) {
      const index = pair.indexOf('=');
      if (index > 0) args[pair.slice(0, index)] = pair.slice(index + 1);
    }
    return {name: call[1], args};
  }
  const assignment = part.match(/^([A-Za-z]+)=(.*)$/);
  return assignment ? {name: assignment[1], args: {value: assignment[2]}} : {name: part, args: {}};
}

function knownTypes(known) {
  return known.map((id) => generation.moves.get(calc.toID(slugOf(id)))?.type).filter(Boolean);
}

/** Traduz um requisito do Cobblemon para texto e estado. Só dado capturado (nível, natureza, golpes) cumpre ou deixa pendente. */
function requirementOf(part, ctx) {
  const {name, args} = parsePart(part);
  const unverified = (kind, text) => ({kind, text, status: 'não verificado'});
  switch (name) {
    case 'level': {
      const minLevel = Number(args.minLevel);
      return {requirement: {kind: 'nível', text: `nível ${minLevel}`, status: ctx.level >= minLevel ? 'cumprido' : 'pendente'}, minLevel};
    }
    case 'friendship':
      return {requirement: unverified('amizade', `amizade ${args.amount} ou mais`)};
    case 'time_range':
      return {requirement: unverified('horário', `horário: ${args.range}`)};
    case 'biome': {
      const inverse = Object.hasOwn(args, 'biomeAnticondition');
      const biome = titleCase((args.biomeCondition ?? args.biomeAnticondition ?? '').replace(/^#/, '').split('/').at(-1));
      return {requirement: unverified('bioma', `${inverse ? 'fora do bioma' : 'no bioma'}: ${biome}`)};
    }
    case 'held_item':
      return {requirement: unverified('item', `segurando ${titleCase(args.itemCondition ?? '')}`)};
    case 'requiredContext':
      return {requirement: unverified('item', `usar ${titleCase(args.value)}`)};
    case 'has_move': {
      const moveId = `cobblemon:${calc.toID(args.move ?? '')}`;
      const status = !ctx.movesKnown ? 'não verificado' : ctx.known.includes(moveId) ? 'cumprido' : 'pendente';
      return {requirement: {kind: 'golpe', text: `conhecer ${moveLabel(moveId)}`, status}};
    }
    case 'has_move_type': {
      const type = args.type ?? '';
      const matches = knownTypes(ctx.known).some((candidate) => candidate.toLowerCase() === type.toLowerCase());
      const status = !ctx.movesKnown ? 'não verificado' : matches ? 'cumprido' : 'pendente';
      return {requirement: {kind: 'golpe', text: `conhecer um golpe do tipo ${titleCase(type)}`, status}};
    }
    case 'properties': {
      const target = args.target ?? '';
      const nature = args.nature ?? target.match(/nature=([a-z]+)/)?.[1];
      if (nature) {
        const observed = ctx.nature?.replace(/^[^:]+:/, '');
        const status = observed ? (observed === nature ? 'cumprido' : 'pendente') : 'não verificado';
        return {requirement: {kind: 'natureza', text: `natureza ${titleCase(nature)}`, status}, natureMismatch: status === 'pendente'};
      }
      const gender = target.match(/^gender=([a-z]+)$/)?.[1];
      if (gender) return {requirement: unverified('outro', `gênero: ${gender}`)};
      return {
        requirement: unverified(
          'outro',
          `propriedade: ${[
            target,
            ...Object.entries(args)
              .filter(([key]) => key !== 'target')
              .map(([key, value]) => `${key}=${value}`),
          ].join(' ')}`,
        ),
      };
    }
    default:
      return {requirement: unverified('outro', `condição especial: ${titleCase(part)}`)};
  }
}

/** Requisitos de uma variante de evolução. `droppable` quando um fato capturado já exclui a variante (natureza diferente). */
function parseVariant(evolution, ctx) {
  const requirements = [];
  let minLevel = null;
  let droppable = false;
  if (evolution.method === 'trade') requirements.push({kind: 'troca', text: 'troca com outro jogador', status: 'não verificado'});
  for (const part of String(evolution.requirement ?? '')
    .split('; ')
    .filter(Boolean)) {
    const parsed = requirementOf(part, ctx);
    requirements.push(parsed.requirement);
    if (parsed.minLevel !== undefined) minLevel = Math.max(minLevel ?? 0, parsed.minLevel);
    if (parsed.natureMismatch) droppable = true;
  }
  return {requirements, minLevel, droppable};
}

function reachOf(minLevel, levelCap, level) {
  if (minLevel === null) return {withinCap: null, reachText: 'sem exigência de nível; depende dos requisitos não verificados'};
  if (levelCap === null) return {withinCap: null, reachText: 'o app não conhece o level cap; alcance não verificado'};
  if (minLevel <= levelCap) {
    return {
      withinCap: true,
      reachText:
        level >= minLevel ? `nível ${minLevel} já atingido e dentro do cap ${levelCap}` : `nível ${minLevel} cabe no cap ${levelCap}`,
    };
  }
  return {withinCap: false, reachText: `exige nível ${minLevel}, acima do cap ${levelCap}`};
}

function levelMap(learnset, aboveLevel) {
  const levels = new Map();
  for (const move of learnset?.levelUp ?? []) {
    if (move.level <= aboveLevel) continue;
    const current = levels.get(move.moveId);
    if (current === undefined || move.level < current) levels.set(move.moveId, move.level);
  }
  return levels;
}

/** Golpes que a forma atual aprende adiante por nível e que mudam, somem ou chegam antes se evoluir. */
function moveChangesOf(learnsets, speciesId, toSpeciesId, level, useful) {
  const current = levelMap(lookup(learnsets, slugOf(speciesId)), level);
  const evolved = levelMap(lookup(learnsets, slugOf(toSpeciesId)), level);
  const changes = [];
  for (const [moveId, before] of current) {
    const isUseful = useful.has(moveId);
    if (!isUseful && !Object.hasOwn(COMPATIBILITY.moves, moveId)) continue;
    const after = evolved.get(moveId) ?? null;
    const name = moveLabel(moveId);
    let kind = null;
    let note = null;
    if (after === null) {
      kind = 'perdido';
      note = `aprende ${name} no nível ${before} sem evoluir; evoluído, não aprende por nível`;
    } else if (after > before) {
      kind = 'atrasado';
      note = `aprende ${name} no nível ${before} sem evoluir; evoluído, só no ${after}`;
    } else if (after < before) {
      kind = 'adiantado';
      note = `aprende ${name} no nível ${before} sem evoluir; evoluído, já no ${after}`;
    }
    if (kind) changes.push({moveId, useful: isUseful, kind, levelWithoutEvolving: before, levelAfterEvolving: after, note});
  }
  return changes.sort(
    (left, right) =>
      Number(right.useful) - Number(left.useful) ||
      left.levelWithoutEvolving - right.levelWithoutEvolving ||
      (left.moveId < right.moveId ? -1 : 1),
  );
}

function memberPlan(individual, useful, levelCap, data) {
  const base = {uuid: individual.uuid, speciesId: individual.speciesId, formId: individual.formId, level: individual.level};
  const blocked = (reason) => ({...base, status: 'bloqueado', blockedReason: reason, options: []});
  if (individual.formId === 'unknown') return blocked('forma desconhecida: não dá para saber quais evoluções valem');
  if (individual.formId !== 'normal') return blocked(`evoluções da forma ${individual.formId} não estão nos dados (só a forma normal)`);
  if (!Number.isSafeInteger(individual.level)) return blocked('nível não capturado');
  const evolutions = lookup(data.evolutions, slugOf(individual.speciesId));
  if (!evolutions) return blocked('espécie sem dados de evolução');
  const known = knownMoves(individual);
  const ctx = {
    level: individual.level,
    nature: individual.observed?.nature ?? null,
    known: [...known.equipped, ...known.learned],
    movesKnown: individual.equippedMovesKnown === true && individual.learnedMovesKnown === true,
  };
  const options = [];
  const seen = new Set();
  for (const evolution of evolutions) {
    const variant = parseVariant(evolution, ctx);
    if (variant.droppable) continue;
    const key = `${evolution.to}|${variant.requirements.map((requirement) => requirement.text).join('|')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      toSpeciesId: evolution.to,
      method: evolution.method,
      requirements: variant.requirements,
      ...reachOf(variant.minLevel, levelCap, individual.level),
      moveChanges: moveChangesOf(data.learnsets, individual.speciesId, evolution.to, individual.level, useful),
    });
  }
  return {...base, status: options.length > 0 ? 'evolui' : 'sem-evolução', blockedReason: null, options};
}

/**
 * Evoluções possíveis de cada membro do time: requisitos legíveis, alcance dentro do level cap e golpes por nível
 * que mudam ao evoluir. Requisito sem dado capturado é "não verificado", nunca cumprido.
 */
async function buildEvolutionPlan({snapshot, request, data, checkpoint = async () => {}}) {
  const team = request.team;
  if (!Array.isArray(team) || team.length < 1 || team.length > MAX_TEAM) throw new Error(`o time precisa ter de 1 a ${MAX_TEAM} membros`);
  const levelCap = request.levelCap ?? null;
  if (levelCap !== null && !(Number.isSafeInteger(levelCap) && levelCap >= 1 && levelCap <= 100))
    throw new Error('levelCap precisa ser inteiro de 1 a 100 ou nulo');
  const seen = new Set();
  const members = [];
  for (const member of team) {
    await checkpoint();
    if (seen.has(member.uuid)) throw new Error(`membro repetido no time: ${member.uuid}`);
    seen.add(member.uuid);
    const individual = snapshot.individuals.find((candidate) => candidate.uuid === member.uuid);
    if (!individual) throw new Error(`membro ${member.uuid} não está no snapshot atual`);
    members.push(memberPlan(individual, new Set(member.usefulMoveIds ?? []), levelCap, data));
  }
  return {
    levelCap,
    members,
    assumptions: [
      'Os golpes marcados como úteis são os que o guia recomendou para o objetivo, equipados ou a adquirir.',
      'O app não lê inventário: item de evolução aparece como requisito, sem dizer se você o tem.',
      'Mais de uma opção para a mesma espécie são alternativas: basta cumprir uma.',
    ],
    limits: [...LIMITS],
  };
}

module.exports = {buildEvolutionPlan};
