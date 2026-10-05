import catalogJson from '../../../electron/lib/combat-compatibility.json';
import {heldItemCatalogName} from '../../domain/catalog-labels';
import {titleCaseId} from '../../domain/dex';
import type {PlayerIndividual, PlayerSnapshot, PlayerStat, RealDamageRequest, RealDamageResult} from '../../platform/api';

export type DamageTargetDraft = {
  speciesId: string;
  level: string;
  nature: string;
  ability: string;
  ivs: Record<PlayerStat, string>;
  evs: Record<PlayerStat, string>;
};

export type DamageConfirmationKey = keyof RealDamageRequest['assumptions'];
export type DamageConfirmations = Record<DamageConfirmationKey, boolean>;

export type DamageWorkspaceIdentity = {
  individualUuid: string | null;
  revision: number | string;
};

export type DamagePlannerState = {
  identity: DamageWorkspaceIdentity;
  currentSlotIndex: number;
  candidateMoveId: string;
  target: DamageTargetDraft;
  confirmations: DamageConfirmations;
  phase: 'idle' | 'calculating' | 'result' | 'error';
  result: RealDamageResult | null;
  error: string | null;
  activeRequestId: number | null;
};

export type DamagePlannerAction =
  | {type: 'identity-changed'; identity: DamageWorkspaceIdentity}
  | {type: 'candidate-selected'; identity: DamageWorkspaceIdentity; candidateMoveId: string}
  | {type: 'slot-selected'; identity: DamageWorkspaceIdentity; slotIndex: number}
  | {type: 'target-updated'; identity: DamageWorkspaceIdentity; patch: Partial<DamageTargetDraft>}
  | {type: 'stat-updated'; identity: DamageWorkspaceIdentity; group: 'ivs' | 'evs'; stat: PlayerStat; value: string}
  | {type: 'confirmation-updated'; identity: DamageWorkspaceIdentity; key: DamageConfirmationKey; checked: boolean}
  | {type: 'calculation-started'; identity: DamageWorkspaceIdentity; requestId: number}
  | {type: 'calculation-succeeded'; identity: DamageWorkspaceIdentity; requestId: number; result: RealDamageResult}
  | {type: 'calculation-failed'; identity: DamageWorkspaceIdentity; requestId: number; error: string}
  | {type: 'calculation-invalidated'; identity: DamageWorkspaceIdentity};

type CompatibilityCatalog = {
  ruleset: {id: string; cobblemonVersion: string; showdownVersion: string; calcVersion: string};
  species: Record<string, {name: string; abilities: string[]}>;
  moves: Record<string, {name: string}>;
  items: Record<string, {name: string}>;
  abilities: Record<string, string>;
  natures: Record<string, string>;
};

const catalog = catalogJson as unknown as CompatibilityCatalog;

export const DAMAGE_STATS: readonly PlayerStat[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export const DAMAGE_STAT_LABELS: Record<PlayerStat, string> = {
  hp: 'HP',
  atk: 'Ataque',
  def: 'Defesa',
  spa: 'Ataque especial',
  spd: 'Defesa especial',
  spe: 'Velocidade',
};

export const DAMAGE_CONFIRMATION_KEYS = [
  'rulesetMatchesActiveWorld',
  'actorBaselineConfirmed',
  'actorFullHpConfirmed',
  'targetBaselineConfirmed',
  'fieldBaselineConfirmed',
] as const satisfies readonly DamageConfirmationKey[];

const CONFIRMATION_COPY: Record<DamageConfirmationKey, {label: string; detail?: string}> = {
  rulesetMatchesActiveWorld: {
    label: `Mundo com Cobblemon ${catalog.ruleset.cobblemonVersion} e Showdown ${catalog.ruleset.showdownVersion}`,
    detail: 'O app não detecta a versão do servidor.',
  },
  actorBaselineConfirmed: {
    label: 'Seu Pokémon sem status ou aspecto de batalha',
  },
  actorFullHpConfirmed: {
    label: 'Seu Pokémon com HP cheio',
    detail: 'Necessário para habilidades e golpes que dependem do HP.',
  },
  targetBaselineConfirmed: {label: 'Alvo na forma normal, sem aspectos, item ou status, com HP cheio'},
  fieldBaselineConfirmed: {
    label: 'Campo neutro',
    detail: 'Sem clima, terreno, telas, salas, trocas de habilidade, boosts ou Terastal.',
  },
};

/**
 * `heldItem: null` no snapshot v2 é desconhecido, não prova ausência de item. Nesse caso a confirmação do ator
 * também exige que a pessoa ateste que o Pokémon está sem item; com item registrado, ele entra no cálculo.
 */
export function damageConfirmationCopy(key: DamageConfirmationKey, heldItem: string | null): {label: string; detail?: string} {
  if (key !== 'actorBaselineConfirmed') return CONFIRMATION_COPY[key];
  return heldItem === null
    ? {
        label: 'Seu Pokémon sem status, aspecto de batalha nem item',
        detail: 'O save não registra o item (heldItem ausente). Confirme que ele não segura nenhum item.',
      }
    : {label: CONFIRMATION_COPY[key].label, detail: 'O item registrado no save entra no cálculo.'};
}

export const DAMAGE_SPECIES_OPTIONS = Object.entries(catalog.species)
  .filter(([, species]) => species.abilities.some((abilityId) => Boolean(catalog.abilities[abilityId])))
  .map(([id, species]) => ({id, name: species.name}))
  .sort((left, right) => left.name.localeCompare(right.name));

export const DAMAGE_NATURE_OPTIONS = Object.entries(catalog.natures)
  .filter(([id]) => !id.includes(':'))
  .map(([id, name]) => ({id: `cobblemon:${id}`, name}))
  .sort((left, right) => left.name.localeCompare(right.name));

export function parseDamageInteger(value: string, minimum: number, maximum: number): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

export function createDamageTargetDraft(): DamageTargetDraft {
  return {
    speciesId: '',
    level: '',
    nature: '',
    ability: '',
    ivs: {hp: '', atk: '', def: '', spa: '', spd: '', spe: ''},
    evs: {hp: '', atk: '', def: '', spa: '', spd: '', spe: ''},
  };
}

export function createDamageConfirmations(): DamageConfirmations {
  return {
    rulesetMatchesActiveWorld: false,
    actorBaselineConfirmed: false,
    actorFullHpConfirmed: false,
    targetBaselineConfirmed: false,
    fieldBaselineConfirmed: false,
  };
}

export function createDamagePlannerState(identity: DamageWorkspaceIdentity): DamagePlannerState {
  return {
    identity,
    currentSlotIndex: 0,
    candidateMoveId: '',
    target: createDamageTargetDraft(),
    confirmations: createDamageConfirmations(),
    phase: 'idle',
    result: null,
    error: null,
    activeRequestId: null,
  };
}

export function sameDamageIdentity(left: DamageWorkspaceIdentity, right: DamageWorkspaceIdentity): boolean {
  return left.individualUuid === right.individualUuid && left.revision === right.revision;
}

function clearCalculation(state: DamagePlannerState): DamagePlannerState {
  return {
    ...state,
    phase: 'idle',
    result: null,
    error: null,
    activeRequestId: null,
  };
}

export function damagePlannerReducer(state: DamagePlannerState, action: DamagePlannerAction): DamagePlannerState {
  if (action.type === 'identity-changed') {
    if (sameDamageIdentity(state.identity, action.identity)) return state;
    return {
      ...state,
      identity: action.identity,
      currentSlotIndex: 0,
      candidateMoveId: '',
      confirmations: createDamageConfirmations(),
      phase: 'idle',
      result: null,
      error: null,
      activeRequestId: null,
    };
  }

  if (!sameDamageIdentity(state.identity, action.identity)) return state;

  switch (action.type) {
    case 'candidate-selected':
      return {...clearCalculation(state), candidateMoveId: action.candidateMoveId};
    case 'slot-selected':
      return {...clearCalculation(state), currentSlotIndex: action.slotIndex};
    case 'target-updated':
      return {
        ...clearCalculation(state),
        target: {
          ...state.target,
          ...action.patch,
          ...(action.patch.speciesId !== undefined ? {ability: ''} : {}),
        },
      };
    case 'stat-updated':
      return {
        ...clearCalculation(state),
        target: {
          ...state.target,
          [action.group]: {...state.target[action.group], [action.stat]: action.value},
        },
      };
    case 'confirmation-updated':
      return {
        ...clearCalculation(state),
        confirmations: {...state.confirmations, [action.key]: action.checked},
      };
    case 'calculation-started':
      return {
        ...state,
        phase: 'calculating',
        result: null,
        error: null,
        activeRequestId: action.requestId,
      };
    case 'calculation-succeeded':
      if (state.activeRequestId !== action.requestId) return state;
      return {...state, phase: 'result', result: action.result, error: null, activeRequestId: null};
    case 'calculation-failed':
      if (state.activeRequestId !== action.requestId) return state;
      return {...state, phase: 'error', result: null, error: action.error, activeRequestId: null};
    case 'calculation-invalidated':
      return clearCalculation(state);
  }
}

export type DamageCandidateMove = PlayerIndividual['learnedMoves'][number];

export function damageCandidateMoves(individual: PlayerIndividual): DamageCandidateMove[] {
  const seenMoves = new Set<string>();
  return individual.learnedMoves.filter((move) => {
    if (individual.equippedMoves.some((equipped) => equipped.id === move.id) || !catalog.moves[move.id] || seenMoves.has(move.id))
      return false;
    seenMoves.add(move.id);
    return true;
  });
}

export function damageActorBlocker(individual: PlayerIndividual): string | null {
  if (individual.formId !== 'normal' || !catalog.species[individual.speciesId])
    return 'espécie ou forma não pertence ao catálogo normal compatível';
  if (individual.level === null || individual.level < 1 || individual.level > 100) return 'nível do indivíduo não foi capturado';
  if (!individual.observed.nature || !catalog.natures[individual.observed.nature])
    return 'natureza do indivíduo não foi capturada ou não está mapeada';
  if (!individual.observed.ability || !catalog.abilities[individual.observed.ability])
    return 'habilidade do indivíduo não foi capturada ou não está mapeada';
  const species = catalog.species[individual.speciesId];
  const abilityId = individual.observed.ability.startsWith('cobblemon:')
    ? individual.observed.ability
    : `cobblemon:${individual.observed.ability}`;
  if (!species.abilities.includes(abilityId)) return 'habilidade observada não pertence ao mapeamento da espécie';
  if (individual.observed.heldItem !== null && heldItemCatalogName(individual.observed.heldItem) === null)
    return `o item segurado ${titleCaseId(individual.observed.heldItem)} não está no catálogo compatível`;
  if (individual.battleStats.hyperTrainedIvs === undefined) return 'IVs Hyper Trained não foram capturados';
  for (const stat of DAMAGE_STATS) {
    const override = individual.battleStats.hyperTrainedIvs[stat];
    if (override.state !== 'known') return 'algum IV efetivo permanece desconhecido';
    if (override.value === null && individual.battleStats.ivs[stat].state !== 'known') return 'algum IV efetivo permanece desconhecido';
    if (individual.battleStats.evs[stat].state !== 'known') return 'algum EV permanece desconhecido';
  }
  if (individual.equippedMovesKnown !== true || individual.learnedMovesKnown !== true)
    return 'listas de golpes equipados/aprendidos não foram capturadas';
  if (!individual.equippedMoves.some((move) => damageMoveSupported(move.id)))
    return 'nenhum golpe equipado pertence ao subconjunto direto compatível';
  if (damageCandidateMoves(individual).length === 0) return 'não há golpe aprendido compatível para comparar';
  return null;
}

export function damageSwapBlocker(individual: PlayerIndividual, slotIndex: number, candidateMoveId: string): string | null {
  const actorBlocker = damageActorBlocker(individual);
  if (actorBlocker) return actorBlocker;
  if (!damageMoveSupported(individual.equippedMoves[slotIndex]?.id ?? ''))
    return `o golpe do slot ${slotIndex + 1} não pertence ao subconjunto direto compatível`;
  if (!damageCandidateMoves(individual).some((move) => move.id === candidateMoveId))
    return 'o golpe candidato não pertence ao subconjunto direto compatível';
  return null;
}

export function damageMoveSupported(moveId: string): boolean {
  return Boolean(catalog.moves[moveId]);
}

export type DamagePlannerView = {
  blocker: string | null;
  candidateMoves: DamageCandidateMove[];
  profileBlocker: string | null;
  confirmationBlocker: boolean;
  selectedSpecies: CompatibilityCatalog['species'][string] | undefined;
  abilities: Array<{id: string; name: string}>;
  ready: boolean;
};

export function getDamagePlannerView(individual: PlayerIndividual | null, state: DamagePlannerState): DamagePlannerView {
  const candidateMoves = individual ? damageCandidateMoves(individual) : [];
  const blocker = !individual
    ? 'Selecione um indivíduo da captura para iniciar um cálculo.'
    : state.identity.individualUuid !== individual.uuid
      ? 'O indivíduo selecionado mudou. Atualize a captura do cálculo.'
      : damageActorBlocker(individual);
  const selectedSpecies = catalog.species[state.target.speciesId];
  const abilities =
    selectedSpecies?.abilities.filter((id) => Boolean(catalog.abilities[id])).map((id) => ({id, name: catalog.abilities[id]})) ?? [];

  let profileBlocker: string | null = null;
  if (!damageMoveSupported(individual?.equippedMoves[state.currentSlotIndex]?.id ?? ''))
    profileBlocker = 'escolha um slot equipado com golpe compatível';
  else if (!state.candidateMoveId || !candidateMoves.some((move) => move.id === state.candidateMoveId))
    profileBlocker = 'escolha um golpe aprendido compatível';
  else if (!selectedSpecies) profileBlocker = 'escolha uma espécie do catálogo compatível';
  else if (parseDamageInteger(state.target.level, 1, 100) === null) profileBlocker = 'informe um nível entre 1 e 100';
  else if (!DAMAGE_NATURE_OPTIONS.some((nature) => nature.id === state.target.nature)) profileBlocker = 'escolha uma natureza mapeada';
  else if (!abilities.some((ability) => ability.id === state.target.ability))
    profileBlocker = 'escolha uma habilidade disponível para a espécie';
  else if (DAMAGE_STATS.some((stat) => parseDamageInteger(state.target.ivs[stat], 0, 31) === null))
    profileBlocker = 'informe os seis IVs do alvo, de 0 a 31';
  else if (DAMAGE_STATS.some((stat) => parseDamageInteger(state.target.evs[stat], 0, 252) === null))
    profileBlocker = 'informe os seis EVs do alvo, de 0 a 252';
  else if (DAMAGE_STATS.reduce((sum, stat) => sum + Number(state.target.evs[stat]), 0) > 510)
    profileBlocker = 'a soma dos EVs do alvo não pode exceder 510';

  const confirmationBlocker = DAMAGE_CONFIRMATION_KEYS.some((key) => !state.confirmations[key]);
  const ready = !blocker && !profileBlocker && !confirmationBlocker && state.phase !== 'calculating';
  return {blocker, candidateMoves, profileBlocker, confirmationBlocker, selectedSpecies, abilities, ready};
}

export function buildRealDamageRequest(
  individual: PlayerIndividual | null,
  snapshot: PlayerSnapshot | null,
  state: DamagePlannerState,
): RealDamageRequest | null {
  if (!individual || !snapshot || state.identity.individualUuid !== individual.uuid || !getDamagePlannerView(individual, state).ready)
    return null;
  const level = parseDamageInteger(state.target.level, 1, 100);
  if (level === null) return null;
  const ivs = Object.fromEntries(DAMAGE_STATS.map((stat) => [stat, parseDamageInteger(state.target.ivs[stat], 0, 31)])) as Record<
    PlayerStat,
    number | null
  >;
  const evs = Object.fromEntries(DAMAGE_STATS.map((stat) => [stat, parseDamageInteger(state.target.evs[stat], 0, 252)])) as Record<
    PlayerStat,
    number | null
  >;
  if (Object.values(ivs).some((value) => value === null) || Object.values(evs).some((value) => value === null)) return null;

  return {
    sources: snapshot.sources.map((source) => ({kind: source.kind, sha256: source.sha256})),
    individualUuid: individual.uuid,
    currentSlotIndex: state.currentSlotIndex,
    candidateMoveId: state.candidateMoveId,
    target: {
      speciesId: state.target.speciesId,
      formId: 'normal',
      level,
      nature: state.target.nature,
      ability: state.target.ability,
      ivs: ivs as Record<PlayerStat, number>,
      evs: evs as Record<PlayerStat, number>,
    },
    assumptions: {
      rulesetMatchesActiveWorld: true,
      actorBaselineConfirmed: true,
      actorFullHpConfirmed: true,
      targetBaselineConfirmed: true,
      fieldBaselineConfirmed: true,
    },
  };
}
