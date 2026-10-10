'use strict';

const calc = require('@smogon/calc');
const {damageRange, pokemonFromSpec} = require('../calc-profile.cjs');
const {COMPATIBILITY, baseActorProfile} = require('../real-damage.cjs');
const {resolveOpponentSpecies} = require('../species-forms.cjs');
const {averagePercent, effectiveSpeed, matchupOutcome} = require('./engine.cjs');
const {lookup, namedFromCatalog} = require('./opponents.cjs');

const generation = calc.Generations.get(9);
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const MAX_TEAM = 6;
const MAX_MOVES = 4;
const DOUBLES_REASON = 'batalha em dupla, fora do escopo';
const LIMITS = Object.freeze([
  'Singles; IA do RCT não modelada; HP e PP cheios no início; sem status, críticos ou precisão; clima, terreno e Intimidate de habilidade de entrada são modelados; itens alternativos do adversário: vale o pior caso entre os catalogados.',
  'A simulação é determinística: dano por acerto = média dos 16 rolls; sem cura, bolsa, itens consumíveis (além do Focus Sash), recuo ou dano residual; a troca de membro segue um critério próprio, não a IA do RCT.',
  'O plano mostra números e riscos declarados; não estima chance de resultado.',
]);

/** Habilidade → clima/terreno do calc e o nome em português para o jogador. */
const WEATHER_ABILITIES = Object.freeze({
  drizzle: ['Rain', 'Chuva'],
  drought: ['Sun', 'Sol forte'],
  orichalcumpulse: ['Sun', 'Sol forte'],
  sandstream: ['Sand', 'Tempestade de Areia'],
  snowwarning: ['Snow', 'Neve'],
  primordialsea: ['Heavy Rain', 'Chuva Pesada'],
  desolateland: ['Harsh Sunshine', 'Sol Extremamente Forte'],
  deltastream: ['Strong Winds', 'Ventos Fortes'],
});
const TERRAIN_ABILITIES = Object.freeze({
  electricsurge: ['Electric', 'Terreno Elétrico'],
  hadronengine: ['Electric', 'Terreno Elétrico'],
  grassysurge: ['Grassy', 'Terreno de Grama'],
  psychicsurge: ['Psychic', 'Terreno Psíquico'],
  mistysurge: ['Misty', 'Terreno Enevoado'],
});
/** Habilidades de entrada que o adaptador não modela: o confronto fica bloqueado em vez de calculado errado. */
const UNMODELED_ENTRY_ABILITIES = Object.freeze({
  trace: 'cópia de habilidade',
  imposter: 'transformação',
  neutralizinggas: 'supressão de habilidades',
  seedsower: 'terreno de grama ao sofrer dano',
});
/** Alvos que não sofrem a queda de Ataque do Intimidate. */
const INTIMIDATE_IMMUNE = new Set([
  'clearbody',
  'hypercutter',
  'whitesmoke',
  'fullmetalbody',
  'innerfocus',
  'oblivious',
  'owntempo',
  'scrappy',
]);
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

function buildTeam(request, individuals, assumptions) {
  const members = request.team;
  if (!Array.isArray(members) || members.length < 1 || members.length > MAX_TEAM) {
    throw new Error(`o time precisa ter de 1 a ${MAX_TEAM} membros`);
  }
  const seen = new Set();
  const levelCap = Number.isSafeInteger(request.levelCap) ? request.levelCap : null;
  if (levelCap === null) {
    assumptions.push(
      'O level cap não foi informado e não foi considerado: o time pode conter Pokémon acima do cap, que o treinador do RCT não aceita enfrentar.',
    );
  }
  const built = members.map((member) => {
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
    return {uuid: member.uuid, speciesId: individual.speciesId, level: individual.level, pokemon, moveIds};
  });
  // Contra treinador do RCT o cap proíbe a luta com qualquer Pokémon acima dele na party (Issue #142).
  const over = levelCap === null ? [] : built.filter((member) => member.level > levelCap);
  if (request.respectLevelCap === false) {
    if (levelCap !== null && over.length > 0) {
      assumptions.push(
        `O level cap (${levelCap}) está ignorado a seu pedido: os membros acima dele entram no plano, mas precisam baixar o nível ou ir para o PC antes da luta.`,
      );
    }
    return {team: built, over};
  }
  const team = levelCap === null ? built : built.filter((member) => member.level <= levelCap);
  for (const member of over) {
    assumptions.push(
      `${speciesName(member.speciesId)} (nível ${member.level}) ficou fora do plano por estar acima do level cap (${levelCap}); guarde-o no PC antes da batalha.`,
    );
  }
  if (team.length === 0) throw new Error(`nenhum membro do time está dentro do level cap (${levelCap})`);
  return {team, over: []};
}

// --- Adversário --------------------------------------------------------------------------------------------------

/**
 * Constrói o adversário ou lista o que bloqueia este confronto. IV ausente vale 31 e EV ausente vale 0.
 * Tudo vem do catálogo versionado: espécie/forma, habilidade, natureza e golpes de dano. Fora dele o confronto bloqueia.
 * `variants` são os Pokémon por item alternativo catalogado (o RCT sorteia um deles).
 */
function buildOpponent(member, index, trainerId) {
  const blockers = [];
  const resolved = resolveOpponentSpecies(member.speciesId, member.aspects);
  const label = resolved.ok ? resolved.name : speciesName(member.speciesId);
  if (!resolved.ok) blockers.push(`${resolved.reason} de ${label}`);

  const abilityName = namedFromCatalog(COMPATIBILITY.abilities, member.ability);
  const abilityKey = abilityName ? calc.toID(abilityName) : '';
  if (!abilityName) blockers.push(`habilidade ${member.ability} fora do catálogo compatível`);
  else if (Object.hasOwn(UNMODELED_ENTRY_ABILITIES, abilityKey)) {
    blockers.push(`habilidade ${abilityName}: ${UNMODELED_ENTRY_ABILITIES[abilityKey]}, fora do adaptador`);
  }

  const nature = namedFromCatalog(COMPATIBILITY.natures, member.nature);
  if (!nature) blockers.push(`natureza ${member.nature} fora do catálogo compatível`);

  const alternatives = Array.isArray(member.heldItem) ? member.heldItem : member.heldItem ? [member.heldItem] : [];
  const modeled = alternatives.filter((id) => itemKey(id) !== null);
  const unmodeled = alternatives.filter((id) => itemKey(id) === null);
  let partial = null;
  if (alternatives.length > 0 && modeled.length === 0) {
    blockers.push(`${joinOr(unmodeled.map(itemLabel))}: item fora do adaptador (Mega Evolução, Cristal Z ou item não catalogado)`);
  } else if (unmodeled.length > 0) {
    partial = `Se segurar ${joinOr(unmodeled.map(itemLabel))}, os números não valem (fora do adaptador).`;
  }

  const moves = [];
  const firstTurnMoves = [];
  const statusMoves = [];
  for (const moveId of member.moves ?? []) {
    const cataloged = lookup(COMPATIBILITY.moves, moveId);
    if (cataloged) {
      (cataloged.firstTurnOnly ? firstTurnMoves : moves).push({id: moveId, name: cataloged.name});
    } else if (calcMove(moveId)?.category === 'Status') {
      statusMoves.push({id: moveId, name: calcMove(moveId).name});
    } else {
      blockers.push(`golpe de dano ${calcMove(moveId)?.name ?? titleCase(moveId)} fora do catálogo compatível`);
    }
  }

  const opponent = {
    id: `${trainerId}#${index}`,
    speciesId: member.speciesId,
    level: member.level,
    abilityId: member.ability,
    abilityName: abilityName ?? '',
    abilityKey,
    alternatives,
    moves,
    firstTurnMoves,
    statusMoves,
    label,
    partial,
    variants: [],
    blockers,
  };
  if (blockers.length > 0) return opponent;
  const ivs = Object.fromEntries(STATS.map((stat) => [stat, member.ivs?.[stat] ?? 31]));
  const evs = Object.fromEntries(STATS.map((stat) => [stat, member.evs?.[stat] ?? 0]));
  try {
    const items = modeled.length > 0 ? modeled.map(itemCalcName) : [''];
    opponent.variants = items.map((item) =>
      pokemonFromSpec({species: {name: resolved.name}, level: member.level, nature, ability: abilityName, ivs, evs, item}),
    );
  } catch (error) {
    opponent.blockers.push(`o motor de cálculo recusou o adversário (${error.message})`);
  }
  return opponent;
}

function opponentRisks(opponent, dealt, firstToAct) {
  const risks = [];
  const {alternatives, label} = opponent;
  const multi = alternatives.length > 1;
  const hedge = (id) => (multi ? ` (se segurar ${itemLabel(id)})` : '');
  const [, weatherLabel] = WEATHER_ABILITIES[opponent.abilityKey] ?? [];
  const [, terrainLabel] = TERRAIN_ABILITIES[opponent.abilityKey] ?? [];
  for (const effect of [weatherLabel, terrainLabel]) {
    if (effect) risks.push({kind: 'habilidade', text: `${label} ativa ${effect} na entrada; o dano já considera isso.`});
  }
  if (opponent.abilityKey === 'intimidate') {
    risks.push({kind: 'habilidade', text: `${label} usa Intimidate na entrada; o dano já considera a queda de Ataque.`});
  }
  for (const move of opponent.firstTurnMoves) {
    risks.push({kind: 'golpe', text: `${label} pode usar ${move.name} só no primeiro turno.`});
  }
  if (opponent.statusMoves.length > 0) {
    const names = opponent.statusMoves.map((move) => move.name);
    risks.push({kind: 'golpe', text: `${label} também tem ${joinOr(names)} (golpes de status não entram nos números).`});
  }
  const sturdy = opponent.abilityKey === 'sturdy';
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
      text: `${label} pode segurar ${joinOr(alternatives.map(itemLabel))}: o plano usa o pior caso entre os itens catalogados.`,
    });
  }
  const immunity = lookup(IMMUNITY_ABILITIES, opponent.abilityKey);
  if (immunity && dealt && dealt.max === 0) {
    risks.push({kind: 'habilidade', text: `${label} anula golpes do tipo ${immunity} com ${opponent.abilityName}.`});
  }
  if (firstToAct === 'incerto' && alternatives.some((id) => SPEED_ITEMS.includes(id)) && risks.length === 0) {
    risks.push({kind: 'item', text: `${label} pode alterar a ordem de ação com o item.`});
  }
  return risks;
}

// --- Confrontos --------------------------------------------------------------------------------------------------

/** Clima e terreno de entrada dos dois lados; dois efeitos diferentes da mesma classe ficam em disputa (depende de quem entra por último). */
function fieldFor(opponentKey, opponentName, memberKey, memberName) {
  const pick = (table, kind) => {
    const ours = table[memberKey];
    const theirs = table[opponentKey];
    if (ours && theirs && ours[0] !== theirs[0]) {
      return {conflict: `${kind} em disputa entre ${opponentName} e ${memberName}: depende de quem entra por último`};
    }
    return {value: (theirs ?? ours)?.[0]};
  };
  const weather = pick(WEATHER_ABILITIES, 'clima');
  if (weather.conflict) return weather;
  const terrain = pick(TERRAIN_ABILITIES, 'terreno');
  if (terrain.conflict) return terrain;
  return {field: new calc.Field({weather: weather.value, terrain: terrain.value})};
}

function boosted(pokemon, deltas) {
  const copy = pokemon.clone();
  for (const [stat, delta] of Object.entries(deltas)) {
    copy.boosts[stat] = Math.max(-6, Math.min(6, (copy.boosts[stat] || 0) + delta));
  }
  return copy;
}

/** Intimidate de `source` sobre `target`. Devolve os dois Pokémon (clonados quando mudam). */
function applyIntimidate(target, source) {
  const key = calc.toID(target.ability ?? '');
  if (INTIMIDATE_IMMUNE.has(key)) return {target, source};
  if (key === 'guarddog' || key === 'contrary' || key === 'defiant') return {target: boosted(target, {atk: 1}), source};
  if (key === 'competitive') return {target: boosted(target, {atk: -1, spa: 2}), source};
  if (key === 'mirrorarmor') return {target, source: boosted(source, {atk: -1})};
  return {target: boosted(target, {atk: -1}), source};
}

function bestDamaging(attacker, defender, moves, field) {
  let best = null;
  for (const move of moves) {
    const percent = averagePercent(attacker, defender, move.name, field);
    if (!best || percent > best.percent) best = {...move, percent};
  }
  return best;
}

/**
 * Confronto de um membro contra o adversário, na pior variante de item para o jogador (menor pontuação; empate: maior
 * dano recebido). Devolve `{conflict}` quando clima ou terreno de entrada estão em disputa.
 */
function evaluateMember(member, opponent) {
  const memberKey = calc.toID(member.pokemon.ability ?? '');
  const fieldResult = fieldFor(opponent.abilityKey, opponent.abilityName, memberKey, member.pokemon.ability);
  if (fieldResult.conflict) return {member, conflict: fieldResult.conflict};
  const {field} = fieldResult;
  const ourMoves = member.moveIds.map((id) => ({id, name: COMPATIBILITY.moves[id].name}));
  let worst = null;
  for (const variant of opponent.variants) {
    let attacker = member.pokemon;
    let defender = variant;
    if (opponent.abilityKey === 'intimidate') ({target: attacker, source: defender} = applyIntimidate(attacker, defender));
    if (memberKey === 'intimidate') ({target: defender, source: attacker} = applyIntimidate(defender, attacker));
    const ours = bestDamaging(attacker, defender, ourMoves, field);
    const theirs = bestDamaging(defender, attacker, opponent.moves, field);
    const outcome = matchupOutcome(ours?.percent ?? 0, theirs?.percent ?? 0, effectiveSpeed(attacker), effectiveSpeed(defender));
    const candidate = {member, ours, theirs, outcome, field, attacker, defender};
    if (
      !worst ||
      candidate.outcome.score < worst.outcome.score ||
      (candidate.outcome.score === worst.outcome.score && (candidate.theirs?.percent ?? 0) > (worst.theirs?.percent ?? 0))
    ) {
      worst = candidate;
    }
  }
  return worst;
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
  const {member, ours, theirs, attacker, defender} = evaluation;
  const ourPriority = priorityOf(ours.id);
  const theirPriority = theirs ? priorityOf(theirs.id) : 0;
  const ourSpeed = effectiveSpeed(attacker);
  const theirSpeed = effectiveSpeed(defender);
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
  const blocked = (reason, risks) => ({
    ...header,
    status: 'bloqueado',
    blockedReason: reason,
    partialReason: null,
    responder: null,
    dealt: null,
    received: null,
    firstToAct: null,
    actReason: null,
    risks,
    evaluation: null,
    trainerId,
  });
  if (opponent.blockers.length > 0) return blocked(opponent.blockers.join('; '), opponentRisks(opponent, null, null));

  const evaluated = team.map((member) => evaluateMember(member, opponent));
  const conflicts = evaluated.filter((evaluation) => evaluation.conflict);
  const evaluations = evaluated.filter((evaluation) => !evaluation.conflict).sort(compareEvaluations);
  const conflictRisks = conflicts.map((evaluation) => ({
    kind: 'habilidade',
    text: `${speciesName(evaluation.member.speciesId)} não foi avaliado contra ${opponent.label}: ${evaluation.conflict}.`,
  }));
  if (evaluations.length === 0) {
    const reasons = [...new Set(conflicts.map((evaluation) => evaluation.conflict))];
    return blocked(reasons.join('; '), [...opponentRisks(opponent, null, null), ...conflictRisks]);
  }
  const best = evaluations[0];
  const dealt = {moveId: best.ours.id, ...damageRange(best.attacker, best.defender, best.ours.name, best.field)};
  const received = best.theirs
    ? {moveId: best.theirs.id, ...damageRange(best.defender, best.attacker, best.theirs.name, best.field)}
    : null;
  const order = actOrder(best, opponent);
  return {
    ...header,
    status: opponent.partial ? 'parcial' : 'planejado',
    blockedReason: null,
    partialReason: opponent.partial,
    responder: {uuid: best.member.uuid, speciesId: best.member.speciesId, moveId: best.ours.id},
    dealt,
    received,
    firstToAct: order.first,
    actReason: order.reason,
    risks: [...opponentRisks(opponent, dealt, order.first), ...conflictRisks],
    evaluation: best,
    opponent,
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

/** O lead é o respondedor do primeiro adversário (o RCT abre com o slot 0); com ele bloqueado não há sugestão. */
function pickLead(entries, team) {
  const first = entries[0];
  if (!first || first.status === 'bloqueado' || !first.responder) return null;
  const member = team.find((candidate) => candidate.uuid === first.responder.uuid);
  if (!member) return null;
  const planned = entries.filter((entry) => entry.status !== 'bloqueado' && entry.evaluation);
  const wins = planned.filter((entry) => entry.evaluation.member.uuid === member.uuid && entry.evaluation.outcome.wins).length;
  return {
    uuid: member.uuid,
    speciesId: member.speciesId,
    reason: `${speciesName(member.speciesId)} abre contra o primeiro adversário (${speciesName(first.speciesId)}) e responde com vantagem de turnos a ${wins} de ${planned.length} adversários planejados.`,
  };
}

// --- Simulação da batalha inteira --------------------------------------------------------------------------------

const MAX_TURNS = 100;

/** Números do confronto de um membro contra o adversário, em HP absoluto (dano por acerto = média dos 16 rolls). Nulo se o campo está em disputa. */
function pairContext(member, opponent) {
  const evaluation = evaluateMember(member, opponent);
  if (evaluation.conflict) return null;
  const {attacker, defender, field, ours, theirs} = evaluation;
  const average = (from, to, move) => {
    const {min, max} = damageRange(from, to, move.name, field);
    return Math.floor((min + max) / 2);
  };
  let firstTurn = null;
  for (const move of opponent.firstTurnMoves) {
    const hit = average(defender, attacker, move);
    if (hit > 0 && (!firstTurn || hit > firstTurn.hit)) firstTurn = {hit, priority: priorityOf(move.id)};
  }
  return {
    evaluation,
    ourHit: ours ? average(attacker, defender, ours) : 0,
    ourPriority: ours ? priorityOf(ours.id) : 0,
    theirHit: theirs ? average(defender, attacker, theirs) : 0,
    theirPriority: theirs ? priorityOf(theirs.id) : 0,
    firstTurn,
    ourSpeed: effectiveSpeed(attacker),
    theirSpeed: effectiveSpeed(defender),
    memberMaxHp: attacker.stats.hp,
    memberSturdy: calc.toID(attacker.ability ?? '') === 'sturdy',
  };
}

/** Acerto em HP cheio que seria letal deixa 1 HP quando o alvo tem Sturdy. */
function hitWithSturdy(hp, maxHp, hit, sturdy) {
  return sturdy && hp === maxHp && hit >= hp ? Math.min(1, hp) : Math.max(0, hp - hit);
}

/**
 * Um trecho contínuo do confronto, alterando `state`. Por turno: prioridade do golpe, depois Speed efetiva; empate de Speed
 * favorece o adversário (pior caso). `freeHit`: o adversário acerta primeiro o membro que acabou de entrar.
 * Termina com `member` ou `opponent` (quem caiu), `stall` (ninguém causa dano) ou `limit` (100 turnos no adversário).
 */
function runFight(ctx, state, {freeHit}) {
  let turns = 0;
  const opponentActs = (move) => {
    state.oppActed = true;
    state.memberHp = hitWithSturdy(state.memberHp, ctx.memberMaxHp, move.hit, ctx.memberSturdy);
  };
  const theirMove = () => (!state.oppActed && ctx.firstTurn ? ctx.firstTurn : {hit: ctx.theirHit, priority: ctx.theirPriority});
  const ourHitLands = () => {
    const protectedHit = state.oppSturdy || state.sashAvailable;
    if (protectedHit && state.oppHp === state.oppMaxHp && ctx.ourHit >= state.oppHp) {
      if (!state.oppSturdy) state.sashAvailable = false;
      state.oppHp = Math.min(1, state.oppHp);
    } else {
      state.oppHp = Math.max(0, state.oppHp - ctx.ourHit);
    }
  };
  if (freeHit) opponentActs(theirMove());
  while (state.memberHp > 0 && state.oppHp > 0) {
    if (state.oppTurns >= MAX_TURNS) return {ended: 'limit', turns};
    const their = theirMove();
    if (ctx.ourHit === 0 && ctx.theirHit === 0 && (state.oppActed || !ctx.firstTurn)) return {ended: 'stall', turns};
    turns += 1;
    state.oppTurns += 1;
    const ourFirst = ctx.ourPriority === their.priority ? ctx.ourSpeed > ctx.theirSpeed : ctx.ourPriority > their.priority;
    for (const actor of ourFirst ? ['us', 'them'] : ['them', 'us']) {
      if (state.memberHp <= 0 || state.oppHp <= 0) break;
      if (actor === 'us') ourHitLands();
      else opponentActs(their);
    }
  }
  return {ended: state.memberHp <= 0 ? 'member' : 'opponent', turns};
}

/**
 * Simula, adversário a adversário e na ordem do time do treinador, a batalha inteira com HP carregado entre os
 * confrontos. Determinística; troca o membro só quando o ativo não derruba o adversário e outro derruba, ou após KO.
 */
async function simulateBattle(team, entries, lead, checkpoint) {
  const memberHp = new Map(team.map((member) => [member.uuid, member.pokemon.stats.hp]));
  const steps = [];
  let defeated = 0;
  const finish = (status, stopReason) => ({
    status,
    stopReason,
    steps,
    opponentsDefeated: defeated,
    opponentsTotal: entries.length,
    remaining: team
      .filter((member) => memberHp.get(member.uuid) > 0)
      .map((member) => ({
        uuid: member.uuid,
        speciesId: member.speciesId,
        hp: memberHp.get(member.uuid),
        maxHp: member.pokemon.stats.hp,
      })),
  });
  let active = null;
  for (const [index, entry] of entries.entries()) {
    await checkpoint();
    const name = speciesName(entry.speciesId);
    if (entry.status === 'bloqueado') return finish('interrompida', `adversário ${index + 1} (${name}) bloqueado: ${entry.blockedReason}`);
    const {opponent} = entry;
    const contexts = new Map();
    const contextOf = (member) => {
      if (!contexts.has(member.uuid)) contexts.set(member.uuid, pairContext(member, opponent));
      return contexts.get(member.uuid);
    };
    const oppMaxHp = opponent.variants[0].stats.hp;
    const fight = {
      oppHp: oppMaxHp,
      oppMaxHp,
      oppSturdy: opponent.abilityKey === 'sturdy',
      sashAvailable: opponent.alternatives.length === 1 && opponent.alternatives[0] === 'cobblemon:focus_sash',
      oppActed: false,
      oppTurns: 0,
    };
    const beats = (member, freeHit) => {
      const ctx = contextOf(member);
      if (!ctx) return false;
      return runFight(ctx, {...fight, memberHp: memberHp.get(member.uuid)}, {freeHit}).ended === 'opponent';
    };
    const alive = () => team.filter((member) => memberHp.get(member.uuid) > 0);
    const ranked = (members) =>
      members.filter(contextOf).sort((left, right) => compareEvaluations(contextOf(left).evaluation, contextOf(right).evaluation));

    let entryKind;
    let freeHit = false;
    if (index === 0) {
      active = lead ? team.find((member) => member.uuid === lead.uuid) : null;
      if (!active || !contextOf(active)) return finish('interrompida', 'ninguém pode abrir a batalha contra o primeiro adversário');
      entryKind = 'lead';
    } else if (beats(active, false)) {
      entryKind = 'mantém';
    } else {
      const swap = ranked(alive().filter((member) => member !== active)).find((member) => beats(member, true));
      if (swap) {
        active = swap;
        entryKind = 'troca';
        freeHit = true;
      } else if (contextOf(active)) {
        entryKind = 'mantém';
      } else {
        active = ranked(alive())[0];
        if (!active) return finish('interrompida', `nenhum membro vivo pode ser avaliado contra o adversário ${index + 1} (${name})`);
        entryKind = 'troca';
        freeHit = true;
      }
    }

    for (;;) {
      const ctx = contextOf(active);
      const memberBefore = memberHp.get(active.uuid);
      const opponentBefore = fight.oppHp;
      const state = {...fight, memberHp: memberBefore};
      const result = runFight(ctx, state, {freeHit});
      freeHit = false;
      Object.assign(fight, {oppHp: state.oppHp, sashAvailable: state.sashAvailable, oppActed: state.oppActed, oppTurns: state.oppTurns});
      memberHp.set(active.uuid, state.memberHp);
      const outcome = {opponent: 'adversário derrotado', member: 'membro derrotado'}[result.ended] ?? 'interrompido';
      steps.push({
        opponentIndex: index,
        opponentSpeciesId: entry.speciesId,
        memberUuid: active.uuid,
        memberSpeciesId: active.speciesId,
        entry: entryKind,
        turns: result.turns,
        memberHpBefore: memberBefore,
        memberHpAfter: state.memberHp,
        memberMaxHp: ctx.memberMaxHp,
        opponentHpBefore: opponentBefore,
        opponentHpAfter: state.oppHp,
        opponentMaxHp: oppMaxHp,
        outcome,
      });
      if (result.ended === 'stall') return finish('interrompida', 'impasse: nenhum lado causa dano');
      if (result.ended === 'limit') return finish('interrompida', `limite de ${MAX_TURNS} turnos no adversário ${index + 1} (${name})`);
      if (result.ended === 'opponent') {
        defeated += 1;
        break;
      }
      const next = ranked(alive());
      if (next.length === 0) {
        return finish(
          alive().length === 0 ? 'time derrotado' : 'interrompida',
          alive().length === 0 ? null : `nenhum membro vivo pode ser avaliado contra o adversário ${index + 1} (${name})`,
        );
      }
      active = next.find((member) => beats(member, false)) ?? next[0];
      entryKind = 'após KO';
    }
  }
  return finish('concluída', null);
}

/**
 * Plano de batalha contra um treinador singles: respondedor, golpe, dano nos dois sentidos, ordem de ação e riscos
 * declarados por adversário. Não estima chance de resultado.
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
      simulation: null,
      entries: [],
      assumptions: [],
    };
  }
  const assumptions = [
    'Hipóteses: HP e PP cheios, sem status e sem críticos; clima, terreno e Intimidate de habilidade de entrada entram no dano; a IA do RCT não é modelada.',
    'O time usa os golpes e o item recomendados pelo guia; o app não verifica se você tem os itens.',
    'Item do adversário com várias alternativas: vale o pior caso entre as catalogadas. Golpes de status não entram nos números.',
    'Golpes de vários acertos usam o número de acertos padrão do cálculo (3; 5 com Skill Link).',
    'Simulação: os adversários entram na ordem do time do treinador; empate de Speed favorece o adversário; Focus Sash só vale quando é a única alternativa de item.',
  ];
  const {team, over} = buildTeam(request, snapshot.individuals, assumptions);
  const overCap = over.map((member) => ({
    uuid: member.uuid,
    speciesId: member.speciesId,
    level: member.level,
    levelCap: request.levelCap,
    text: `Nível ${member.level} acima do level cap (${request.levelCap}): baixe o nível para ${request.levelCap} antes da luta ou guarde no PC.`,
  }));
  const entries = [];
  for (const [index, member] of trainer.team.entries()) {
    await checkpoint();
    entries.push(planEntry(buildOpponent(member, index, trainer.id), team, trainer.id));
  }
  const lead = pickLead(entries, team);
  const simulation = await simulateBattle(team, entries, lead, checkpoint);
  const blocked = entries.filter((entry) => entry.status === 'bloqueado').length;
  if (blocked > 0)
    assumptions.push(`${blocked} de ${entries.length} adversário(s) ficaram sem plano por mecânica fora do catálogo ou do adaptador.`);
  return {
    ...header,
    status: 'plano',
    overCap,
    scopeReason: null,
    lead,
    simulation,
    entries: entries.map(({evaluation: _evaluation, opponent: _opponent, trainerId: _trainerId, ...entry}) => entry),
    assumptions,
  };
}

module.exports = {buildBattlePlan};
