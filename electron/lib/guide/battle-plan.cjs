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

const ABILITY_TERRAINS = Object.freeze({
  electricsurge: 'Electric',
  hadronengine: 'Electric',
  grassysurge: 'Grassy',
  seedsower: 'Grassy',
  psychicsurge: 'Psychic',
  mistysurge: 'Misty',
});
const ABILITY_WEATHERS = Object.freeze({
  drizzle: 'Rain',
  primordialsea: 'Rain',
  drought: 'Sun',
  desolateland: 'Sun',
  orichalcumpulse: 'Sun',
  sandstream: 'Sand',
  snowwarning: 'Snow',
});
const ENTRY_RISK_ABILITIES = Object.freeze({
  electricsurge: 'ativa Terreno Elétrico na entrada',
  hadronengine: 'ativa Terreno Elétrico na entrada',
  grassysurge: 'ativa Terreno de Grama na entrada',
  seedsower: 'ativa Terreno de Grama ao sofrer dano',
  psychicsurge: 'ativa Terreno Psíquico na entrada',
  mistysurge: 'ativa Terreno Enevoado na entrada',
  drizzle: 'ativa Chuva na entrada',
  primordialsea: 'ativa Mar Primordial na entrada',
  drought: 'ativa Sol Forte na entrada',
  desolateland: 'ativa Sol Extremamente Forte na entrada',
  orichalcumpulse: 'ativa Sol Forte na entrada',
  sandstream: 'ativa Tempestade de Areia na entrada',
  snowwarning: 'ativa Neve na entrada',
  intimidate: 'reduz o Ataque na entrada com Intimidate (-1 Atk)',
  download: 'ajusta os atributos na entrada com Download',
  trace: 'copia a habilidade do adversário na entrada',
  imposter: 'transforma-se no adversário na entrada',
  neutralizinggas: 'anula as habilidades em campo',
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

const gen7 = calc.Generations.get(7);

function calcMove(moveId) {
  const id = calc.toID(moveId.replace(/^[^:]+:/, ''));
  return generation.moves.get(id) || gen7.moves.get(id);
}
const priorityOf = (moveId) => calcMove(moveId)?.priority ?? 0;
const moveNameOf = (moveId) => COMPATIBILITY.moves[moveId]?.name ?? calcMove(moveId)?.name ?? titleCase(moveId);

function resolveCalcSpeciesName(baseName, aspects = []) {
  if (!aspects || aspects.length === 0) {
    if (baseName.toLowerCase() === 'aegislash') return 'Aegislash-Shield';
    return baseName;
  }
  const suffixMap = {
    alolan: '-Alola',
    alola: '-Alola',
    galarian: '-Galar',
    galar: '-Galar',
    hisuian: '-Hisui',
    hisui: '-Hisui',
    paldean: '-Paldea',
    paldea: '-Paldea',
  };
  for (const aspect of aspects) {
    const suffix = suffixMap[aspect.toLowerCase()];
    if (suffix) {
      const candidate = baseName + suffix;
      if (generation.species.get(calc.toID(candidate))) return candidate;
      if (generation.species.get(calc.toID(`${candidate}-Combat`))) return `${candidate}-Combat`;
    }
  }
  if (baseName.toLowerCase() === 'aegislash') return 'Aegislash-Shield';
  return baseName;
}

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
    const moveIds = [...new Set(member.moveIds ?? [])]
      .filter((id) => Object.hasOwn(COMPATIBILITY.moves, id) || (calcMove(id)?.category && calcMove(id).category !== 'Status'))
      .slice(0, MAX_MOVES);
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

/** Constrói o adversário ou lista o que bloqueia este confronto. IV ausente vale 31 e EV ausente vale 0. */
function buildOpponent(member, index, trainerId) {
  const blockers = [];
  const baseSlug = member.speciesId.replace(/^[^:]+:/, '');
  let species = lookup(COMPATIBILITY.species, member.speciesId);
  if (!species) {
    const cs =
      generation.species.get(calc.toID(baseSlug)) ||
      (baseSlug.toLowerCase() === 'aegislash' ? generation.species.get('aegislashshield') : null);
    if (cs) species = {name: cs.name};
    else blockers.push(`espécie ${speciesName(member.speciesId)} fora do catálogo compatível`);
  }
  const calcSpeciesName = species ? resolveCalcSpeciesName(species.name, member.aspects) : null;
  const label = species
    ? calcSpeciesName !== species.name
      ? `${species.name} (${member.aspects.map(titleCase).join(', ')})`
      : species.name
    : speciesName(member.speciesId);

  const ability = namedFromCatalog(COMPATIBILITY.abilities, member.ability) || generation.abilities.get(calc.toID(member.ability))?.name;
  if (!ability) blockers.push(`habilidade ${member.ability} fora do catálogo compatível`);

  const nature =
    namedFromCatalog(COMPATIBILITY.natures, member.nature) || generation.natures.get(calc.toID(member.nature))?.name || 'Hardy';

  const alternatives = Array.isArray(member.heldItem) ? member.heldItem : member.heldItem ? [member.heldItem] : [];
  const moves = [];
  const statusMoves = [];
  for (const moveId of member.moves ?? []) {
    if (Object.hasOwn(COMPATIBILITY.moves, moveId)) {
      moves.push({id: moveId, name: COMPATIBILITY.moves[moveId].name});
    } else {
      const cm = calcMove(moveId);
      if (cm?.category && cm.category !== 'Status') {
        moves.push({id: moveId, name: cm.name});
      } else if (cm?.category === 'Status') {
        statusMoves.push({id: moveId, name: cm.name});
      } else {
        blockers.push(`golpe ${titleCase(moveId)} desconhecido`);
      }
    }
  }
  const base = {
    id: `${trainerId}#${index}`,
    speciesId: member.speciesId,
    level: member.level,
    abilityId: member.ability,
    alternatives,
    moves,
    statusMoves,
    label,
    pokemon: null,
    blockers,
  };
  if (blockers.length > 0) return base;
  const ivs = Object.fromEntries(STATS.map((stat) => [stat, member.ivs?.[stat] ?? 31]));
  const evs = Object.fromEntries(STATS.map((stat) => [stat, member.evs?.[stat] ?? 0]));
  const item = alternatives.length === 1 ? itemCalcName(alternatives[0]) : '';
  try {
    base.pokemon = pokemonFromSpec({species: {name: calcSpeciesName}, level: member.level, nature, ability, ivs, evs, item});
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
  const modded = alternatives.find((id) => id.startsWith('mega_showdown:'));
  if (modded) {
    risks.push({kind: 'item', text: `${label} pode portar ${itemLabel(modded)} (Mega Evolução ou Cristal Z).`});
  }
  const entryRisk = ENTRY_RISK_ABILITIES[opponent.abilityId];
  if (entryRisk) {
    risks.push({kind: 'habilidade', text: `${label} ${entryRisk}.`});
  }
  for (const sm of opponent.statusMoves ?? []) {
    risks.push({kind: 'golpe', text: `${label} conhece o golpe de status ${sm.name}.`});
  }
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

function battleFieldFor(oppAbility, playAbility) {
  const terrain = ABILITY_TERRAINS[oppAbility] ?? (playAbility ? ABILITY_TERRAINS[playAbility] : undefined);
  const weather = ABILITY_WEATHERS[oppAbility] ?? (playAbility ? ABILITY_WEATHERS[playAbility] : undefined);
  return new calc.Field({terrain, weather});
}

function bestDamaging(attacker, defender, moves, field) {
  let best = null;
  for (const move of moves) {
    const percent = averagePercent(attacker, defender, move.name, field);
    if (!best || percent > best.percent) best = {...move, percent};
  }
  return best;
}

function evaluateMember(member, opponent) {
  const field = battleFieldFor(opponent.abilityId, member.pokemon.ability);
  let effectivePlayer = member.pokemon;
  let effectiveOpponent = opponent.pokemon;

  if (opponent.abilityId === 'intimidate') {
    effectivePlayer = member.pokemon.clone();
    effectivePlayer.boosts.atk = Math.max(-6, Math.min(6, (effectivePlayer.boosts.atk || 0) - 1));
  }
  if (member.pokemon.ability === 'intimidate') {
    effectiveOpponent = opponent.pokemon.clone();
    effectiveOpponent.boosts.atk = Math.max(-6, Math.min(6, (effectiveOpponent.boosts.atk || 0) - 1));
  }

  const ourMoves = member.moveIds.map((id) => ({id, name: moveNameOf(id)}));
  const ours = bestDamaging(effectivePlayer, effectiveOpponent, ourMoves, field);
  const theirs = bestDamaging(effectiveOpponent, effectivePlayer, opponent.moves, field);
  const outcome = matchupOutcome(
    ours?.percent ?? 0,
    theirs?.percent ?? 0,
    effectiveSpeed(effectivePlayer),
    effectiveSpeed(effectiveOpponent),
  );
  return {member, ours, theirs, outcome, field, effectivePlayer, effectiveOpponent};
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
  const dealt = {moveId: best.ours.id, ...damageRange(best.effectivePlayer, best.effectiveOpponent, best.ours.name, best.field)};
  const received = best.theirs
    ? {moveId: best.theirs.id, ...damageRange(best.effectiveOpponent, best.effectivePlayer, best.theirs.name, best.field)}
    : null;
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

function pickLead(entries, team) {
  const slotZero = entries[0];
  if (!slotZero?.responder) return null;
  const planned = entries.filter((entry) => entry.status === 'planejado' && entry.evaluation);
  const advantages = (uuid) => planned.filter((entry) => entry.evaluation.member.uuid === uuid && entry.evaluation.outcome.wins).length;
  const member = team.find((candidate) => candidate.uuid === slotZero.responder.uuid);
  if (!member) return null;
  const wins = advantages(member.uuid);
  return {
    uuid: member.uuid,
    speciesId: member.speciesId,
    reason: `${speciesName(member.speciesId)} abre porque é o melhor respondedor ao primeiro adversário do plano (${speciesName(slotZero.speciesId)}) e responde com vantagem de turnos a ${wins} de ${planned.length} adversários planejados.`,
  };
}

/**
 * Simulação sequencial de batalha completa (6v6): rastreia dano acumulado,
 * HP residual transportado de confronto a confronto, trocas e KO replacements.
 */
function simulateTeamBattle(team, entries, lead) {
  const teamRemainingHp = Object.fromEntries(team.map((m) => [m.uuid, 100]));
  const sequence = [];

  const plannedEntries = entries.filter((entry) => entry.status === 'planejado' && entry.evaluation && entry.opponent);
  if (plannedEntries.length === 0) {
    return {sequence, teamRemainingHp};
  }

  let currentMemberUuid = lead?.uuid || team[0].uuid;

  for (let i = 0; i < plannedEntries.length; i++) {
    const entry = plannedEntries[i];
    const opponent = entry.opponent;

    const evals = new Map(team.map((m) => [m.uuid, evaluateMember(m, opponent)]));
    const living = team.filter((m) => teamRemainingHp[m.uuid] > 0);
    if (living.length === 0) break;

    let activeMemberUuid = currentMemberUuid;
    let action = 'manter';

    if (i === 0) {
      action = 'iniciar';
      activeMemberUuid = currentMemberUuid;
    } else if (teamRemainingHp[currentMemberUuid] <= 0) {
      action = 'entrar-apos-ko';
      const bestLiving = [...living].sort((a, b) => compareEvaluations(evals.get(a.uuid), evals.get(b.uuid)))[0];
      activeMemberUuid = bestLiving.uuid;
    } else {
      const currentEval = evals.get(currentMemberUuid);
      const bestLiving = [...living].sort((a, b) => compareEvaluations(evals.get(a.uuid), evals.get(b.uuid)))[0];
      const bestLivingEval = evals.get(bestLiving.uuid);

      const shouldSwitch =
        bestLiving.uuid !== currentMemberUuid &&
        (!currentEval.outcome.wins ||
          currentEval.outcome.ourTurns > bestLivingEval.outcome.ourTurns ||
          (teamRemainingHp[currentMemberUuid] <= 30 && teamRemainingHp[bestLiving.uuid] > 50));

      if (shouldSwitch) {
        action = 'trocar';
        activeMemberUuid = bestLiving.uuid;
      } else {
        action = 'manter';
        activeMemberUuid = currentMemberUuid;
      }
    }

    currentMemberUuid = activeMemberUuid;
    const member = team.find((m) => m.uuid === activeMemberUuid);
    const evaluation = evals.get(activeMemberUuid);
    const order = actOrder(evaluation, opponent);

    const hpBefore = teamRemainingHp[activeMemberUuid];
    const ourTurns = Math.max(1, evaluation.outcome.ourTurns || 1);
    const theirHit = evaluation.theirs?.percent ?? 0;

    let opponentHits = 0;
    if (order.first === 'jogador') {
      opponentHits = Math.max(0, ourTurns - 1);
    } else {
      opponentHits = ourTurns;
    }

    const damageTaken = opponentHits * theirHit;
    const hpAfter = Math.max(0, Math.round((hpBefore - damageTaken) * 10) / 10);
    teamRemainingHp[activeMemberUuid] = hpAfter;

    const opponentDefeated = hpAfter > 0 || hpBefore > damageTaken;

    sequence.push({
      step: sequence.length + 1,
      opponentId: entry.opponentId,
      opponentSpeciesId: entry.speciesId,
      opponentLevel: entry.level,
      memberUuid: member.uuid,
      memberSpeciesId: member.speciesId,
      action,
      hpBeforePercent: hpBefore,
      hpAfterPercent: hpAfter,
      moveId: evaluation.ours ? evaluation.ours.id : member.moveIds[0],
      damageDealtPercent: Math.min(100, Math.round((evaluation.ours?.percent ?? 0) * ourTurns)),
      turnsTaken: ourTurns,
      opponentDefeated,
    });

    if (!opponentDefeated) {
      const remainingLiving = team.filter((m) => teamRemainingHp[m.uuid] > 0);
      if (remainingLiving.length > 0) {
        const finisher = [...remainingLiving].sort((a, b) => compareEvaluations(evals.get(a.uuid), evals.get(b.uuid)))[0];
        const finisherEval = evals.get(finisher.uuid);
        const finisherHpBefore = teamRemainingHp[finisher.uuid];
        const finisherHpAfter = finisherHpBefore;
        currentMemberUuid = finisher.uuid;

        sequence.push({
          step: sequence.length + 1,
          opponentId: entry.opponentId,
          opponentSpeciesId: entry.speciesId,
          opponentLevel: entry.level,
          memberUuid: finisher.uuid,
          memberSpeciesId: finisher.speciesId,
          action: 'entrar-apos-ko',
          hpBeforePercent: finisherHpBefore,
          hpAfterPercent: finisherHpAfter,
          moveId: finisherEval.ours ? finisherEval.ours.id : finisher.moveIds[0],
          damageDealtPercent: 100,
          turnsTaken: 1,
          opponentDefeated: true,
        });
      }
    }
  }

  return {sequence, teamRemainingHp};
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
  const assumptions = [
    'Hipóteses: HP e PP cheios, sem status, campo neutro e sem críticos; a IA do RCT não é modelada.',
    'O time usa os golpes e o item recomendados pelo guia; o app não verifica se você tem os itens.',
    'O item do adversário só entra no dano quando a definição tem uma única alternativa no catálogo; golpes de status são ignorados.',
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
  const {sequence, teamRemainingHp} = simulateTeamBattle(team, entries, lead);
  const blocked = entries.filter((entry) => entry.status === 'bloqueado').length;
  if (blocked > 0)
    assumptions.push(`${blocked} de ${entries.length} adversário(s) ficaram sem plano por mecânica fora do catálogo ou do adaptador.`);
  return {
    ...header,
    status: 'plano',
    overCap,
    scopeReason: null,
    lead,
    sequence,
    teamRemainingHp,
    entries: entries.map(({evaluation: _evaluation, opponent: _opponent, trainerId: _trainerId, ...entry}) => entry),
    assumptions,
  };
}

module.exports = {buildBattlePlan};
