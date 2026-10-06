'use strict';

const calc = require('@smogon/calc');
const {damageRange, pokemonFromSpec} = require('../calc-profile.cjs');
const {COMPATIBILITY} = require('../real-damage.cjs');
const {assessEligibility} = require('./eligibility.cjs');
const {lookup, pveOpponents, trainerOpponents} = require('./opponents.cjs');

const generation = calc.Generations.get(9);
const MAX_MOVES = 4;
const CANDIDATE_POOL = 8;
const MAX_TEAM = 6;
const MAX_ACQUIRE = 3;
const MIN_ACQUIRE_GAIN = 5;
const LIMITS = Object.freeze(['Singles; sem trocas, IA ou golpes de status; HP cheio; campo neutro; sem críticos ou precisão.']);
const FIXED_ITEMS = Object.freeze(['choiceband', 'choicespecs', 'choicescarf', 'lifeorb', 'expertbelt', 'assaultvest', 'focussash']);
const TYPE_ITEMS = Object.freeze({
  Normal: 'silkscarf',
  Fire: 'charcoal',
  Water: 'mysticwater',
  Electric: 'magnet',
  Grass: 'miracleseed',
  Ice: 'nevermeltice',
  Fighting: 'blackbelt',
  Poison: 'poisonbarb',
  Ground: 'softsand',
  Flying: 'sharpbeak',
  Psychic: 'twistedspoon',
  Bug: 'silverpowder',
  Rock: 'hardstone',
  Ghost: 'spelltag',
  Dragon: 'dragonfang',
  Dark: 'blackglasses',
  Steel: 'metalcoat',
  Fairy: 'fairyfeather',
});
// Ids do Cobblemon que não saem do nome do Showdown pela regra geral.
const COBBLEMON_ITEM_ALIASES = Object.freeze({charcoal: 'charcoal_stick'});

const toId = (name) => calc.toID(name);

function cobblemonItemId(showdownId, name) {
  const alias = COBBLEMON_ITEM_ALIASES[showdownId];
  if (alias) return `cobblemon:${alias}`;
  const slug = name
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `cobblemon:${slug}`;
}

function heldItemKey(heldItem) {
  if (typeof heldItem !== 'string' || !heldItem.startsWith('cobblemon:')) return null;
  const key = heldItem.slice('cobblemon:'.length).replace(/_/g, '');
  return Object.hasOwn(COMPATIBILITY.items, key) ? key : null;
}

function itemName(key) {
  return key === null ? '' : COMPATIBILITY.items[key].name;
}

// --- Matchup ---------------------------------------------------------------------------------------------------

function turnsToKnockOut(percent) {
  return percent > 0 ? Math.max(1, Math.ceil(100 / percent - 1e-9)) : Number.POSITIVE_INFINITY;
}

function effectiveSpeed(pokemon) {
  return pokemon.item === 'Choice Scarf' ? Math.floor(pokemon.stats.spe * 1.5) : pokemon.stats.spe;
}

/** Resultado de um confronto: quem derruba antes vence; empate de turnos vai para quem tem maior Speed efetiva. */
function matchupOutcome(ourPercent, theirPercent, ourSpeed, theirSpeed) {
  const ourTurns = turnsToKnockOut(ourPercent);
  const theirTurns = turnsToKnockOut(theirPercent);
  const wins = ourTurns < theirTurns || (ourTurns === theirTurns && ourSpeed > theirSpeed);
  const margin = ourTurns === theirTurns ? 0 : theirTurns - ourTurns;
  const score = wins ? 1 + 0.5 * Math.min(1, margin / 3) : 0;
  return {wins, ourTurns, theirTurns, score};
}

function averagePercent(attacker, defender, moveName) {
  const {min, max, targetHP} = damageRange(attacker, defender, moveName);
  return ((min + max) / 2 / targetHP) * 100;
}

/** Melhor dano médio (em % do HP do alvo) dos golpes do adversário contra o nosso Pokémon. */
function theirBestPercents(opponents, pokemon) {
  return opponents.map((opponent) => {
    let best = 0;
    for (const move of opponent.moves) best = Math.max(best, averagePercent(opponent.pokemon, pokemon, move.name));
    return best;
  });
}

function ourPercentTable(opponents, pokemon, moveIds) {
  const table = new Map();
  for (const moveId of moveIds) {
    const name = COMPATIBILITY.moves[moveId].name;
    table.set(
      moveId,
      opponents.map((opponent) => averagePercent(pokemon, opponent.pokemon, name)),
    );
  }
  return table;
}

function evaluateSet(table, moveIds, theirs, opponents, pokemon) {
  const ourSpeed = effectiveSpeed(pokemon);
  const outcomes = opponents.map((opponent, index) => {
    let best = 0;
    for (const moveId of moveIds) best = Math.max(best, table.get(moveId)[index]);
    return matchupOutcome(best, theirs[index], ourSpeed, effectiveSpeed(opponent.pokemon));
  });
  return {
    outcomes,
    wins: outcomes.filter((outcome) => outcome.wins).length,
    score: outcomes.reduce((sum, outcome) => sum + outcome.score, 0),
  };
}

function combinations(items, size) {
  const output = [];
  const walk = (start, chosen) => {
    if (chosen.length === size) {
      output.push([...chosen]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      chosen.push(items[index]);
      walk(index + 1, chosen);
      chosen.pop();
    }
  };
  walk(0, []);
  return output;
}

// --- Item e golpes de um indivíduo -----------------------------------------------------------------------------

function stabItemKey(profile, moveIds, table) {
  const speciesTypes = generation.species.get(toId(profile.species.name))?.types ?? [];
  let bestType = null;
  let bestTotal = -1;
  for (const moveId of moveIds) {
    const type = generation.moves.get(toId(COMPATIBILITY.moves[moveId].name))?.type;
    if (!type || !speciesTypes.includes(type)) continue;
    const total = table.get(moveId).reduce((sum, value) => sum + value, 0);
    if (total > bestTotal) {
      bestTotal = total;
      bestType = type;
    }
  }
  return bestType ? (TYPE_ITEMS[bestType] ?? null) : null;
}

function itemCandidates(profile, currentKey, moveIds, table) {
  const keys = new Set(FIXED_ITEMS);
  if (generation.species.get(toId(profile.species.name))?.nfe) keys.add('eviolite');
  const stab = stabItemKey(profile, moveIds, table);
  if (stab) keys.add(stab);
  if (currentKey) keys.add(currentKey);
  return [...keys].filter((key) => Object.hasOwn(COMPATIBILITY.items, key) && key !== currentKey);
}

/** Melhor conjunto de golpes e item para um indivíduo contra os adversários. */
function optimizeMember(entry, opponents) {
  const {individual, profile, known} = entry;
  const currentKey = heldItemKey(individual.observed.heldItem);
  const base = pokemonFromSpec({...profile, item: itemName(currentKey)});

  const knownIds = [...new Set([...known.equipped, ...known.learned])];
  const candidateIds = knownIds.filter((id) => Object.hasOwn(COMPATIBILITY.moves, id));
  const baseTable = ourPercentTable(opponents, base, candidateIds);
  const total = (id) => baseTable.get(id).reduce((sum, value) => sum + value, 0);
  const pool = [...candidateIds].sort((left, right) => total(right) - total(left) || (left < right ? -1 : 1)).slice(0, CANDIDATE_POOL);
  const baseTheirs = theirBestPercents(opponents, base);

  let chosen = pool.slice(0, MAX_MOVES);
  let evaluated = evaluateSet(baseTable, chosen, baseTheirs, opponents, base);
  for (const combo of combinations(pool, Math.min(MAX_MOVES, pool.length))) {
    const result = evaluateSet(baseTable, combo, baseTheirs, opponents, base);
    if (result.score > evaluated.score + 1e-9) {
      chosen = combo;
      evaluated = result;
    }
  }
  const baseline = evaluated;
  let chosenItem = currentKey;
  let pokemon = base;
  let table = baseTable;
  let theirs = baseTheirs;
  for (const key of itemCandidates(profile, currentKey, chosen, baseTable)) {
    const withItem = pokemonFromSpec({...profile, item: itemName(key)});
    const itemTable = ourPercentTable(opponents, withItem, chosen);
    const itemTheirs = theirBestPercents(opponents, withItem);
    const result = evaluateSet(itemTable, chosen, itemTheirs, opponents, withItem);
    if (result.score > evaluated.score + 1e-9) {
      evaluated = result;
      chosenItem = key;
      pokemon = withItem;
      table = itemTable;
      theirs = itemTheirs;
    }
  }
  return {entry, currentKey, chosen, chosenItem, pokemon, table, theirs, evaluated, baseline, known};
}

// --- Golpes a adquirir -----------------------------------------------------------------------------------------

function learnsetRoutes(learnset, level) {
  const routes = new Map();
  const add = (moveId, requirement) => {
    if (!routes.has(moveId)) routes.set(moveId, requirement);
  };
  for (const move of learnset?.levelUp ?? []) if (move.level > level) add(move.moveId, `nível ${move.level}`);
  for (const moveId of learnset?.tm ?? []) add(moveId, 'TM');
  for (const moveId of learnset?.tutor ?? []) add(moveId, 'tutor');
  return routes;
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function acquireSuggestions(result, opponents, learnsets) {
  const {entry, chosen, pokemon, theirs, table} = result;
  const slug = entry.individual.speciesId.replace(/^[^:]+:/, '');
  const routes = learnsetRoutes(lookup(learnsets, slug), entry.individual.level);
  const knownIds = new Set(result.known.equipped.concat(result.known.learned));
  const candidates = [...routes.keys()].filter((id) => Object.hasOwn(COMPATIBILITY.moves, id) && !knownIds.has(id));
  if (candidates.length === 0) return [];
  const extra = ourPercentTable(opponents, pokemon, candidates);
  const all = new Map([...table, ...extra]);
  const baseScore = result.evaluated.score;
  let keep = chosen;
  if (chosen.length >= MAX_MOVES) {
    // O pior golpe é o que menos faz falta ao conjunto atual.
    let bestWithout = -1;
    for (const moveId of chosen) {
      const rest = chosen.filter((id) => id !== moveId);
      const {score} = evaluateSet(all, rest, theirs, opponents, pokemon);
      if (score > bestWithout) {
        bestWithout = score;
        keep = rest;
      }
    }
  }
  const suggestions = [];
  for (const moveId of candidates) {
    const {score} = evaluateSet(all, [...keep, moveId], theirs, opponents, pokemon);
    const gain = ((score - baseScore) / Math.max(baseScore, 1)) * 100;
    if (gain >= MIN_ACQUIRE_GAIN) suggestions.push({moveId, requirement: routes.get(moveId), gainPercent: roundOne(gain)});
  }
  suggestions.sort((left, right) => right.gainPercent - left.gainPercent || (left.moveId < right.moveId ? -1 : 1));
  return suggestions.slice(0, MAX_ACQUIRE).map((suggestion) => ({
    ...suggestion,
    reason: `${COMPATIBILITY.moves[suggestion.moveId].name} (${suggestion.requirement}) melhora o time em ${suggestion.gainPercent}%.`,
  }));
}

// --- Time ------------------------------------------------------------------------------------------------------

function winSet(result) {
  return new Set(result.evaluated.outcomes.flatMap((outcome, index) => (outcome.wins ? [index] : [])));
}

function pickTeam(results, opponentCount) {
  const remaining = results.map((result) => ({result, wins: winSet(result)}));
  const covered = new Set();
  const team = [];
  while (team.length < MAX_TEAM && remaining.length > 0) {
    let bestIndex = 0;
    let bestKey = null;
    remaining.forEach((candidate, index) => {
      const union = new Set([...covered, ...candidate.wins]).size;
      const key = [union, candidate.result.evaluated.score];
      const better =
        bestKey === null ||
        key[0] > bestKey[0] ||
        (key[0] === bestKey[0] && key[1] > bestKey[1] + 1e-9) ||
        (key[0] === bestKey[0] &&
          Math.abs(key[1] - bestKey[1]) <= 1e-9 &&
          candidate.result.entry.individual.uuid < remaining[bestIndex].result.entry.individual.uuid);
      if (better) {
        bestIndex = index;
        bestKey = key;
      }
    });
    const [picked] = remaining.splice(bestIndex, 1);
    for (const index of picked.wins) covered.add(index);
    team.push(picked.result);
  }
  return {team, coveredCount: Math.min(covered.size, opponentCount)};
}

// --- Saída -----------------------------------------------------------------------------------------------------

function speciesName(speciesId) {
  return lookup(COMPATIBILITY.species, speciesId)?.name ?? speciesId;
}

function memberReason(result, opponents) {
  const outcomes = result.evaluated.outcomes;
  const best = outcomes
    .map((outcome, index) => ({outcome, index}))
    .filter(({outcome}) => outcome.wins)
    .sort((left, right) => right.outcome.score - left.outcome.score || left.index - right.index)
    .map(({index}) => speciesName(opponents[index].speciesId));
  const names = [...new Set(best)].slice(0, 2);
  const detail = names.length > 0 ? ` (melhor contra ${names.join(', ')})` : '';
  return `${speciesName(result.entry.individual.speciesId)} entra porque vence ${result.evaluated.wins} de ${opponents.length} adversários${detail}.`;
}

function itemSummary(result) {
  const heldItem = result.entry.individual.observed.heldItem;
  if (result.chosenItem === result.currentKey) {
    return {id: heldItem, status: heldItem === null ? 'nenhum' : 'tem', reason: 'Mantém o item atual.'};
  }
  const name = itemName(result.chosenItem);
  const id = cobblemonItemId(result.chosenItem, name);
  return {
    id,
    status: id === heldItem ? 'tem' : 'obter',
    reason:
      result.evaluated.wins > result.baseline.wins
        ? `${name} aumenta as vitórias de ${result.baseline.wins} para ${result.evaluated.wins}.`
        : `${name} mantém as ${result.evaluated.wins} vitórias e amplia a margem dos confrontos.`,
  };
}

function memberMoves(result) {
  const equipped = new Set(result.known.equipped);
  const moves = result.chosen.map((id) => ({id, evaluated: true, source: equipped.has(id) ? 'equipado' : 'aprendido'}));
  // Slots que sobram mantêm os golpes equipados que o catálogo não cobre; eles não entram no cálculo.
  for (const id of result.known.equipped) {
    if (moves.length >= MAX_MOVES) break;
    if (!Object.hasOwn(COMPATIBILITY.moves, id) && !moves.some((move) => move.id === id)) {
      moves.push({id, evaluated: false, source: 'equipado'});
    }
  }
  return moves;
}

function referenceLevelOf(individuals, assumptions) {
  const levelsOf = (list) => list.map((individual) => individual.level).filter((level) => Number.isSafeInteger(level));
  const party = levelsOf(individuals.filter((individual) => individual.location.container === 'party'));
  if (party.length > 0) return Math.max(...party);
  const all = levelsOf(individuals);
  if (all.length === 0) throw new Error('nenhum indivíduo com nível conhecido');
  assumptions.push('A party está vazia; o nível de referência é o maior nível do PC.');
  return Math.max(...all);
}

function prepareOpponents(plan, assumptions) {
  const opponents = [];
  const rejected = [];
  for (const opponent of plan.opponents) {
    try {
      opponents.push({...opponent, pokemon: pokemonFromSpec(opponent.spec)});
    } catch {
      rejected.push(`${opponent.speciesId} (${opponent.id})`);
    }
  }
  assumptions.push(...plan.assumptions);
  if (rejected.length > 0) assumptions.push(`Adversários recusados pelo motor de cálculo: ${rejected.join(', ')}.`);
  if (opponents.length === 0) throw new Error('nenhum adversário avaliável para este objetivo');
  return opponents;
}

/**
 * Level cap do RCT contra treinador: o treinador só luta se NENHUM Pokémon da party passa do cap (`TrainerMob#canBattleAgainst`;
 * Issue #142). Por isso, em objetivo de treinador com cap conhecido, quem passa do cap sai do time. PvE geral não aplica o cap.
 */
function applyLevelCap({eligible, excluded}, goal, levelCap, individuals, assumptions) {
  if (goal.kind !== 'trainer') return {eligible, excluded};
  if (!Number.isSafeInteger(levelCap)) {
    assumptions.push(
      'O level cap não foi informado e não foi considerado: o time pode conter Pokémon acima do cap, que o treinador do RCT não aceita enfrentar.',
    );
    return {eligible, excluded};
  }
  const within = eligible.filter((entry) => entry.individual.level <= levelCap);
  const above = eligible.filter((entry) => entry.individual.level > levelCap);
  const aboveInParty = individuals.filter((individual) => individual.location.container === 'party' && individual.level > levelCap);
  if (aboveInParty.length > 0) {
    assumptions.push(
      `O treinador do RCT não luta se qualquer Pokémon da party passar do level cap (${levelCap}), mesmo fora do time: guarde no PC os ${aboveInParty.length} acima do cap antes da batalha.`,
    );
  }
  return {
    eligible: within,
    excluded: [...excluded, ...above.map((entry) => ({uuid: entry.individual.uuid, reason: `acima do level cap (${levelCap})`}))],
  };
}

/**
 * Monta o guia: time de até 6 indivíduos (party + PC), com golpes, item e explicação, para o objetivo pedido.
 * `checkpoint` é chamado entre indivíduos e pode ceder o laço de eventos ou lançar para cancelar.
 */
async function buildGuide({snapshot, goal, data, levelCap = null, checkpoint = async () => {}}) {
  const assumptions = [];
  const individuals = snapshot.individuals;
  const referenceLevel = referenceLevelOf(individuals, assumptions);
  const plan =
    goal.kind === 'trainer' ? trainerOpponents(data.trainers, goal.trainerId) : pveOpponents(data.trainers, data.series, referenceLevel);
  const opponents = prepareOpponents(plan, assumptions);

  const assessed = assessEligibility(individuals);
  const {eligible, excluded} = applyLevelCap(assessed, goal, levelCap, individuals, assumptions);
  const results = [];
  for (const entry of eligible) {
    await checkpoint();
    results.push(optimizeMember(entry, opponents));
  }
  const {team} = pickTeam(results, opponents.length);
  if (team.length < MAX_TEAM) {
    assumptions.push(`Só ${eligible.length} indivíduo(s) elegível(is) entre party e PC; o time tem ${team.length} membro(s).`);
  }
  assumptions.push('Itens sugeridos não são verificados no inventário: o app não sabe se você os tem.');

  const members = [];
  for (const result of team) {
    await checkpoint();
    const {individual} = result.entry;
    members.push({
      uuid: individual.uuid,
      speciesId: individual.speciesId,
      level: individual.level,
      reason: memberReason(result, opponents),
      moves: memberMoves(result),
      item: itemSummary(result),
      matchups: result.evaluated.outcomes.map((outcome, index) => ({
        opponentId: opponents[index].id,
        outcome: outcome.wins ? 'vence' : 'perde',
        ourTurns: outcome.ourTurns,
        theirTurns: outcome.theirTurns,
      })),
      acquire: acquireSuggestions(result, opponents, data.learnsets),
    });
  }

  const partyUuids = individuals.filter((individual) => individual.location.container === 'party').map((individual) => individual.uuid);
  const teamUuids = members.map((member) => member.uuid);
  return {
    goal,
    referenceLevel,
    opponents: opponents.map(({id, speciesId, level, trainerId}) => ({id, speciesId, level, trainerId})),
    team: members,
    currentPartyComparison: {
      kept: teamUuids.filter((uuid) => partyUuids.includes(uuid)),
      added: teamUuids.filter((uuid) => !partyUuids.includes(uuid)),
      removed: partyUuids.filter((uuid) => !teamUuids.includes(uuid)),
    },
    excluded,
    assumptions,
    limits: [...LIMITS],
  };
}

module.exports = {buildGuide, LIMITS, averagePercent, effectiveSpeed, matchupOutcome, prepareOpponents, referenceLevelOf};
