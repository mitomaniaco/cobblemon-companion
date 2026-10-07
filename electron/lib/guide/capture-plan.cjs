'use strict';

const calc = require('@smogon/calc');
const {pokemonFromSpec} = require('../calc-profile.cjs');
const {COMPATIBILITY} = require('../real-damage.cjs');
const {assessEligibility} = require('./eligibility.cjs');
const {averagePercent, effectiveSpeed, matchupOutcome, prepareOpponents, referenceLevelOf} = require('./engine.cjs');
const {lookup, pveOpponents, trainerOpponents} = require('./opponents.cjs');

const generation = calc.Generations.get(9);
const MAX_GAPS = 30;
const MAX_OWNED = 5;
const MAX_CANDIDATES = 5;
const MAX_SPAWNS = 4;
const WILD_IVS = 15;
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const NEVER_RECOMMENDED_LABELS = new Set(['legendary', 'mythical']);
const REGIONAL_FEATURE = /^(alolan|galarian|hisuian|paldean)/;
const BUCKET_ORDER = ['common', 'uncommon', 'rare', 'ultra-rare'];
const CATCH_ORDER = ['liberada', 'depende-do-nível', 'bloqueada'];
const TIME_LABELS = {
  day: 'dia',
  night: 'noite',
  dusk: 'entardecer',
  morning: 'manhã',
  '5000-10999': 'meio-dia (ticks 5000-10999)',
  '11000-16999': 'fim de tarde (ticks 11000-16999)',
  '17000-22999': 'madrugada (ticks 17000-22999)',
};
const LIMITS = Object.freeze([
  'Só spawns naturais conhecidos dos arquivos do jogo; antecondições, peso exato e eventos especiais não são avaliados.',
  'Lendários e míticos não são recomendados; shiny não é considerado.',
  'O app não lê inventário (Poké Balls); esse requisito fica como não verificado.',
]);

const titleCase = (value) =>
  value
    .replace(/^[^:]+:/, '')
    .replace(/[_/-]+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
const speciesName = (speciesId) => lookup(COMPATIBILITY.species, speciesId)?.name ?? titleCase(speciesId);

// --- Spawns legíveis ---------------------------------------------------------------------------------------------

function biomeText(entry, biomes) {
  if (!entry.startsWith('#')) return lookup(biomes.names, entry) ?? titleCase(entry);
  const tag = entry.slice(1);
  const label = titleCase(tag.split('/').at(-1)).replace(/^Is /, '');
  if (lookup(biomes.incompleteTags, tag)) return `${label} (lista de biomas incompleta)`;
  const list = lookup(biomes.tags, tag);
  if (!list) return label;
  if (list.length <= 6) return list.map((id) => lookup(biomes.names, id) ?? titleCase(id)).join(', ');
  return `${label} (${list.length} biomas)`;
}

function conditionTexts(condition) {
  const texts = [];
  if (condition.timeRange !== undefined) texts.push(`horário: ${lookup(TIME_LABELS, condition.timeRange) ?? condition.timeRange}`);
  if (condition.minSkyLight !== undefined || condition.maxSkyLight !== undefined) {
    texts.push(`luz do céu ${condition.minSkyLight ?? 0} a ${condition.maxSkyLight ?? 15}`);
  }
  if (condition.minLight !== undefined || condition.maxLight !== undefined) {
    texts.push(`luz do bloco ${condition.minLight ?? 0} a ${condition.maxLight ?? 15}`);
  }
  if (condition.canSeeSky !== undefined) texts.push(condition.canSeeSky ? 'a céu aberto' : 'sob teto');
  if (condition.isRaining !== undefined) texts.push(condition.isRaining ? 'com chuva' : 'sem chuva');
  if (condition.isThundering) texts.push('com tempestade');
  if (condition.structures?.length) texts.push(`estrutura: ${condition.structures.map(titleCase).join(' ou ')}`);
  if (condition.minY !== undefined || condition.maxY !== undefined) {
    texts.push(`altura Y ${condition.minY ?? 'mín.'} a ${condition.maxY ?? 'máx.'}`);
  }
  if (condition.fluid) texts.push(`em ${titleCase(condition.fluid.replace(/^#/, ''))}`);
  if (condition.neededNearbyBlocks?.length) texts.push(`perto de ${condition.neededNearbyBlocks.map(titleCase).join(', ')}`);
  if (condition.moonPhase !== undefined) texts.push(`fase da lua ${condition.moonPhase}`);
  if (condition.isSlimeChunk) texts.push('em chunk de slime');
  if (condition.rodType) texts.push(`pesca com ${titleCase(condition.rodType)}`);
  if (condition.bait) texts.push(`isca ${titleCase(condition.bait)}`);
  return texts;
}

function spawnOf(entry, biomes) {
  const names = (entry.condition.biomes ?? []).map((biome) => biomeText(biome, biomes));
  return {
    biomes: names.length > 0 ? names : ['qualquer bioma'],
    conditions: conditionTexts(entry.condition),
    levelMin: entry.level.min,
    levelMax: entry.level.max,
    bucket: entry.bucket,
    position: entry.position,
    weight: entry.weight,
  };
}

const publicSpawn = ({weight: _weight, ...spawn}) => spawn;

function usableSpawns(entries, biomes) {
  return entries
    .filter((entry) => entry.type === 'pokemon' && !(entry.features ?? []).some((feature) => REGIONAL_FEATURE.test(feature)))
    .filter((entry) => entry.level && Number.isSafeInteger(entry.level.min) && Number.isSafeInteger(entry.level.max))
    .map((entry) => spawnOf(entry, biomes))
    .sort(
      (left, right) =>
        BUCKET_ORDER.indexOf(left.bucket) - BUCKET_ORDER.indexOf(right.bucket) ||
        right.weight - left.weight ||
        left.levelMin - right.levelMin,
    );
}

function catchStatus(spawn, limit) {
  if (spawn.levelMax <= limit) return 'liberada';
  if (spawn.levelMin > limit) return 'bloqueada';
  return 'depende-do-nível';
}

// --- Candidatos --------------------------------------------------------------------------------------------------

function candidateSpecies(spawnData) {
  const output = [];
  for (const [slug, entries] of Object.entries(spawnData.pools.species)) {
    const speciesId = `cobblemon:${slug}`;
    const species = lookup(COMPATIBILITY.species, speciesId);
    const rules = lookup(spawnData.rules.species, slug);
    if (!species || (rules?.labels ?? []).some((label) => NEVER_RECOMMENDED_LABELS.has(label))) continue;
    const spawns = usableSpawns(entries, spawnData.biomes);
    if (spawns.length === 0) continue;
    output.push({speciesId, slug, species, spawns, regions: rules?.pikaStarRegions ?? null});
  }
  return output;
}

function wildSpec(candidate, level) {
  const abilityId = candidate.species.abilities.find((id) => lookup(COMPATIBILITY.abilities, id));
  return {
    species: candidate.species,
    level,
    nature: COMPATIBILITY.natures['cobblemon:hardy'],
    ability: lookup(COMPATIBILITY.abilities, abilityId),
    ivs: Object.fromEntries(STATS.map((stat) => [stat, WILD_IVS])),
    evs: Object.fromEntries(STATS.map((stat) => [stat, 0])),
    item: '',
  };
}

/** Nível em que o candidato é avaliado: o maior que a faixa de spawn permite dentro do limite de captura. */
function evaluationLevel(spawns, limit) {
  const allowed = spawns.filter((spawn) => spawn.levelMin <= limit);
  if (allowed.length === 0) return Math.min(...spawns.map((spawn) => spawn.levelMin));
  return Math.max(...allowed.map((spawn) => Math.min(spawn.levelMax, limit)));
}

function levelUpMoves(learnsets, slug, level) {
  const ids = new Set();
  for (const move of lookup(learnsets, slug)?.levelUp ?? []) {
    if (move.level <= level && Object.hasOwn(COMPATIBILITY.moves, move.moveId)) ids.add(move.moveId);
  }
  return [...ids];
}

function bestMove(attacker, defender, moves) {
  let best = null;
  for (const move of moves) {
    const percent = averagePercent(attacker, defender, move.name);
    if (!best || percent > best.percent) best = {...move, percent};
  }
  return best;
}

function duel(pokemon, moves, opponent) {
  const ours = bestMove(pokemon, opponent.pokemon, moves);
  if (!ours) return null;
  const theirs = bestMove(opponent.pokemon, pokemon, opponent.moves);
  const outcome = matchupOutcome(ours.percent, theirs?.percent ?? 0, effectiveSpeed(pokemon), effectiveSpeed(opponent.pokemon));
  return {ours, theirs, outcome, first: effectiveSpeed(pokemon) > effectiveSpeed(opponent.pokemon)};
}

const turns = (value) => (Number.isFinite(value) ? `${value}` : 'nenhum');

function duelText(subject, opponent, result) {
  const order = result.first ? 'age primeiro' : 'age depois';
  return `${subject} derruba ${speciesName(opponent.speciesId)} em ${turns(result.outcome.ourTurns)} turno(s) com ${result.ours.name}, contra ${turns(result.outcome.theirTurns)} do adversário; ${order}.`;
}

function compareDuels(left, right) {
  return right.outcome.score - left.outcome.score;
}

function candidateEntry(candidate, opponent, level, limit, firstPartyLevel, learnsets, pikaStar) {
  const spec = wildSpec(candidate, level);
  if (!spec.ability) return null;
  const moves = levelUpMoves(learnsets, candidate.slug, level).map((id) => ({id, name: COMPATIBILITY.moves[id].name}));
  const pokemon = pokemonFromSpec(spec);
  const result = duel(pokemon, moves, opponent);
  if (!result?.outcome.wins) return null;
  const statuses = candidate.spawns.map((spawn) => catchStatus(spawn, limit));
  const catchable = CATCH_ORDER.find((status) => statuses.includes(status));
  const min = Math.min(...candidate.spawns.map((spawn) => spawn.levelMin));
  const max = Math.max(...candidate.spawns.map((spawn) => spawn.levelMax));
  const source =
    firstPartyLevel === null
      ? 'party vazia: teto de captura sem líder'
      : 'nível do primeiro Pokémon da party, supondo que não esteja desmaiado';
  const types = generation.species.get(calc.toID(candidate.species.name))?.types ?? [];
  const requirements = [
    {kind: 'nível', text: `alvo até o nível ${limit} (${source})`, status: catchable === 'liberada' ? 'cumprido' : 'pendente'},
  ];
  for (const region of candidate.regions ?? []) {
    const status = pikaStar?.[region];
    requirements.push({
      kind: 'pika-star',
      text: `advancement Pika Star de ${region} (allthemons:<região>_pika_star)`,
      status: status === true ? 'cumprido' : status === false ? 'pendente' : 'não verificado',
    });
  }
  return {
    entry: {
      speciesId: candidate.speciesId,
      reason: `${duelText(`${candidate.species.name} (${types.join('/')}) no nível ${level}`, opponent, result)}`,
      spawns: candidate.spawns.slice(0, MAX_SPAWNS).map(publicSpawn),
      catchable,
      catchableReason: `Spawns de nível ${min} a ${max}; limite de captura ${limit} (${source}). Poké Ball de captura garantida ignora o limite.`,
      requirements,
    },
    score: result.outcome.score,
  };
}

function ownedEntries(owned, opponent) {
  const found = [];
  for (const member of owned) {
    const result = duel(member.pokemon, member.moves, opponent);
    if (!result?.outcome.wins) continue;
    const {individual} = member;
    const where = individual.location.container === 'party' ? 'party' : 'PC';
    found.push({
      score: result.outcome.score,
      entry: {
        uuid: individual.uuid,
        speciesId: individual.speciesId,
        level: individual.level,
        container: individual.location.container,
        reason: duelText(`${speciesName(individual.speciesId)} (${where}, nível ${individual.level})`, opponent, result),
      },
    });
  }
  return found
    .sort(compareDuels)
    .slice(0, MAX_OWNED)
    .map(({entry}) => entry);
}

/**
 * Para cada lacuna do time (adversário que nenhum membro vence): primeiro quem o jogador já tem no PC ou na party fora
 * do time, depois espécies com spawn natural conhecido que vencem o adversário, com onde, quando, nível e se a regra
 * de captura do modpack libera pelo nível da party.
 */
async function buildCapturePlan({snapshot, request, data, checkpoint = async () => {}}) {
  const individuals = snapshot.individuals;
  if (!Array.isArray(request.gapOpponentIds) || request.gapOpponentIds.length > MAX_GAPS) {
    throw new Error(`gapOpponentIds precisa ter até ${MAX_GAPS} adversários`);
  }
  const assumptions = [];
  const referenceLevel = referenceLevelOf(individuals, assumptions);
  const goal = request.goal;
  const plan =
    goal.kind === 'trainer' ? trainerOpponents(data.trainers, goal.trainerId) : pveOpponents(data.trainers, data.series, referenceLevel);
  const opponents = prepareOpponents(plan, []);
  const unknown = request.gapOpponentIds.filter((id) => !opponents.some((opponent) => opponent.id === id));
  if (unknown.length > 0) assumptions.push(`Adversários que não existem neste objetivo foram ignorados: ${unknown.join(', ')}.`);
  const gapOpponents = opponents.filter((opponent) => request.gapOpponentIds.includes(opponent.id));

  const party = individuals.filter((individual) => individual.location.container === 'party');
  const firstParty = [...party].sort((left, right) => left.location.slot - right.location.slot)[0];
  const firstPartyLevel = Number.isSafeInteger(firstParty?.level) ? firstParty.level : null;
  const limit = firstPartyLevel ?? data.spawns.rules.outOfBattle.noLeaderMaxLevel;

  const teamUuids = new Set(request.teamUuids);
  const owned = assessEligibility(individuals.filter((individual) => !teamUuids.has(individual.uuid))).eligible.map(
    ({individual, profile, known}) => {
      const key = String(individual.observed.heldItem ?? '')
        .replace(/^cobblemon:/, '')
        .replace(/_/g, '');
      const item = Object.hasOwn(COMPATIBILITY.items, key) ? COMPATIBILITY.items[key].name : '';
      const moves = [...known.equipped, ...known.learned]
        .filter((id, index, all) => all.indexOf(id) === index && Object.hasOwn(COMPATIBILITY.moves, id))
        .map((id) => ({id, name: COMPATIBILITY.moves[id].name}));
      return {individual, pokemon: pokemonFromSpec({...profile, item}), moves};
    },
  );
  const candidates = candidateSpecies(data.spawns);

  const gaps = [];
  for (const opponent of gapOpponents) {
    await checkpoint();
    const found = [];
    for (const candidate of candidates) {
      const level = evaluationLevel(candidate.spawns, limit);
      const built = candidateEntry(candidate, opponent, level, limit, firstPartyLevel, data.learnsets, request.pikaStar);
      if (built) found.push(built);
    }
    found.sort(
      (left, right) =>
        CATCH_ORDER.indexOf(left.entry.catchable) - CATCH_ORDER.indexOf(right.entry.catchable) ||
        right.score - left.score ||
        (left.entry.speciesId < right.entry.speciesId ? -1 : 1),
    );
    const ownedHere = ownedEntries(owned, opponent);
    const entries = found.slice(0, MAX_CANDIDATES).map(({entry}) => entry);
    gaps.push({
      opponentId: opponent.id,
      speciesId: opponent.speciesId,
      level: opponent.level,
      owned: ownedHere,
      candidates: entries,
      note:
        entries.length > 0
          ? null
          : 'Nenhuma espécie com spawn natural conhecido vence este adversário com os golpes que aprende por nível até o nível de captura.',
    });
  }
  assumptions.push(
    `Capturas são avaliadas no maior nível de spawn permitido pelo limite, com IVs ${WILD_IVS}, EVs 0, natureza neutra (Hardy), primeira habilidade do catálogo, sem item e só com golpes aprendidos por nível.`,
    'O app não vê quem está desmaiado: o limite usa o nível do primeiro Pokémon da party.',
    'Quem já está no PC ou na party fora do time aparece antes de qualquer captura.',
  );
  return {firstPartyLevel, gaps, assumptions, limits: [...LIMITS]};
}

module.exports = {buildCapturePlan};
