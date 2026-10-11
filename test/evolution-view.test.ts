import {describe, expect, it} from 'vitest';
import {
  evolutionLevelProgress,
  evolutionMoveTiming,
  evolutionOptionStatus,
  evolutionRequirementText,
  orderedMoveChanges,
  splitEvolutionMembers,
} from '../src/features/guide/evolution-model';
import type {EvolutionMoveChange, EvolutionOption, EvolutionPlanMemberResult, EvolutionRequirement} from '../src/platform/api';

const level = (text: string, status: EvolutionRequirement['status']): EvolutionRequirement => ({kind: 'nível', text, status});
const unverified = (kind: EvolutionRequirement['kind'], text: string): EvolutionRequirement => ({kind, text, status: 'não verificado'});

function option(requirements: EvolutionRequirement[], withinCap: boolean | null = null, toSpeciesId = 'cobblemon:raichu'): EvolutionOption {
  return {toSpeciesId, method: 'level_up', requirements, withinCap, reachText: '', moveChanges: []};
}

function member(uuid: string, status: EvolutionPlanMemberResult['status'], options: EvolutionOption[] = []): EvolutionPlanMemberResult {
  return {uuid, speciesId: 'cobblemon:pikachu', formId: 'normal', level: 20, status, blockedReason: null, options};
}

function change(kind: EvolutionMoveChange['kind'], useful: boolean, moveId = 'cobblemon:surf'): EvolutionMoveChange {
  return {moveId, useful, kind, levelWithoutEvolving: null, levelAfterEvolving: null, note: 'nota do motor'};
}

describe('situação de cada evolução', () => {
  it('só fica pronta quando todo requisito foi cumprido', () => {
    expect(evolutionOptionStatus(option([level('nível 16', 'cumprido')]))).toBe('pronto');
  });

  it('requisito pendente ou nível acima do cap deixa pendente, mesmo com outro não verificado', () => {
    expect(evolutionOptionStatus(option([level('nível 25', 'pendente'), unverified('amizade', 'amizade 160 ou mais')]))).toBe('pendente');
    expect(evolutionOptionStatus(option([level('nível 16', 'cumprido')], false))).toBe('pendente');
  });

  it('requisito que o app não captura nunca vira pronto', () => {
    expect(evolutionOptionStatus(option([level('nível 16', 'cumprido'), unverified('item', 'usar Fire Stone')]))).toBe('nao-verificado');
  });
});

describe('cartões por membro', () => {
  it('ordena prontos, pendentes, não verificados e bloqueados, e manda quem não evolui para a lista', () => {
    const {cards, none} = splitEvolutionMembers([
      member('bloqueado', 'bloqueado'),
      member('nada', 'sem-evolução'),
      member('nao-verificado', 'evolui', [option([unverified('troca', 'troca')])]),
      member('pendente', 'evolui', [option([level('nível 30', 'pendente')])]),
      member('pronto', 'evolui', [option([level('nível 10', 'cumprido')])]),
    ]);
    expect(cards.map((card) => card.member.uuid)).toEqual(['pronto', 'pendente', 'nao-verificado', 'bloqueado']);
    expect(none.map((entry) => entry.uuid)).toEqual(['nada']);
    expect(cards[3]?.option).toBeNull();
  });

  it('com várias alternativas, exibe a mais próxima e lista as outras', () => {
    const near = option([level('nível 10', 'cumprido')], null, 'cobblemon:a');
    const far = option([unverified('item', 'usar Pedra')], null, 'cobblemon:b');
    const {cards} = splitEvolutionMembers([member('eevee', 'evolui', [far, near])]);
    expect(cards[0]?.option).toBe(near);
    expect(cards[0]?.alternatives).toEqual([far]);
  });
});

describe('progresso de nível', () => {
  it('usa o maior nível exigido e não passa de 100%', () => {
    expect(evolutionLevelProgress(option([level('nível 25', 'pendente')]), 24)).toEqual({current: 24, required: 25, ratio: 24 / 25});
    expect(evolutionLevelProgress(option([level('nível 16', 'cumprido')]), 30)).toEqual({current: 16, required: 16, ratio: 1});
  });

  it('sem exigência de nível não há barra', () => {
    expect(evolutionLevelProgress(option([unverified('item', 'usar Pedra')]), 30)).toBeNull();
  });
});

describe('textos para o jogador', () => {
  it('mostra quantos níveis faltam só enquanto pendente', () => {
    expect(evolutionRequirementText(level('nível 25', 'pendente'), 24)).toBe('Chegar ao nível 25 · falta 1');
    expect(evolutionRequirementText(level('nível 16', 'cumprido'), 20)).toBe('Chegar ao nível 16');
  });

  it('traduz troca e capitaliza os demais', () => {
    expect(evolutionRequirementText(unverified('troca', 'troca com outro jogador'), 10)).toBe('Trocar com outro jogador');
    expect(evolutionRequirementText(unverified('amizade', 'amizade 160 ou mais'), 10)).toBe('Amizade 160 ou mais');
  });
});

describe('golpes que mudam', () => {
  it('põe úteis primeiro e, dentro do grupo, perdido antes de atrasado antes de adiantado', () => {
    const ordered = orderedMoveChanges([
      change('adiantado', false),
      change('atrasado', true),
      change('perdido', false),
      change('perdido', true),
    ]);
    expect(ordered.map((entry) => `${entry.kind}:${entry.useful}`)).toEqual([
      'perdido:true',
      'atrasado:true',
      'perdido:false',
      'adiantado:false',
    ]);
  });

  it('descreve os níveis conhecidos e cai para a nota quando não há nível', () => {
    expect(evolutionMoveTiming({...change('atrasado', true), levelWithoutEvolving: 30, levelAfterEvolving: 36})).toBe(
      'Nv. 30 sem evoluir · Nv. 36 evoluído',
    );
    expect(evolutionMoveTiming({...change('perdido', true), levelWithoutEvolving: 30})).toBe('Nv. 30 sem evoluir');
    expect(evolutionMoveTiming(change('perdido', true))).toBe('nota do motor');
  });
});
