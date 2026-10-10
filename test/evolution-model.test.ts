import {describe, expect, it} from 'vitest';
import {
  buildEvolutionPlanRequest,
  evolutionLevelCapLabel,
  evolutionMethodLabel,
  evolutionMoveChangeKindLabel,
  evolutionReachLabel,
  evolutionRequirementStatusLabel,
  evolutionSummary,
  isInvalidLevelCapInput,
  parseLevelCap,
} from '../src/features/guide/evolution-model';
import type {EvolutionPlanMemberResult, GuideResult, PlayerSnapshot} from '../src/platform/api';

const snapshot = {
  sources: [
    {kind: 'party', sha256: 'a'.repeat(64), modifiedAt: '2026-10-05T00:00:00Z'},
    {kind: 'pc', sha256: 'b'.repeat(64), modifiedAt: '2026-10-05T00:00:00Z'},
  ],
} as unknown as PlayerSnapshot;

const team: GuideResult['team'] = [
  {
    uuid: 'u1',
    speciesId: 'cobblemon:geodude',
    level: 20,
    reason: 'x',
    moves: [
      {id: 'cobblemon:rocktomb', evaluated: true, source: 'equipado'},
      {id: 'cobblemon:growl', evaluated: false, source: 'equipado'},
      {id: 'cobblemon:bulldoze', evaluated: true, source: 'aprendido'},
    ],
    item: {id: null, status: 'nenhum', reason: 'y'},
    matchups: [],
    acquire: [
      {moveId: 'cobblemon:bulldoze', requirement: 'nível 24', gainPercent: 5, replacesMoveId: null, reason: 'z'},
      {moveId: 'cobblemon:earthquake', requirement: 'TM', gainPercent: 9, replacesMoveId: null, reason: 'w'},
    ],
  },
];

describe('level cap informado na tela', () => {
  it('vazio ou inválido é desconhecido, nunca um número presumido', () => {
    expect(parseLevelCap('')).toBeNull();
    expect(parseLevelCap('   ')).toBeNull();
    expect(parseLevelCap('abc')).toBeNull();
    expect(parseLevelCap('0')).toBeNull();
    expect(parseLevelCap('101')).toBeNull();
    expect(parseLevelCap('12.5')).toBeNull();
    expect(parseLevelCap('15')).toBe(15);
    expect(parseLevelCap(' 100 ')).toBe(100);
  });

  it('só marca como inválido quando há texto que não vira cap', () => {
    expect(isInvalidLevelCapInput('')).toBe(false);
    expect(isInvalidLevelCapInput('15')).toBe(false);
    expect(isInvalidLevelCapInput('200')).toBe(true);
    expect(isInvalidLevelCapInput('x')).toBe(true);
  });

  it('diz quando o cap não foi informado e que o alcance fica não verificado', () => {
    expect(evolutionLevelCapLabel(null)).toContain('não verificado');
    expect(evolutionLevelCapLabel(15)).toBe('Level cap usado: 15.');
  });
});

describe('pedido de evoluções', () => {
  it('manda como úteis só os golpes avaliados do guia e os a adquirir, sem repetir', () => {
    const request = buildEvolutionPlanRequest(snapshot, {team}, 15, 'job-1');
    expect(request).toEqual({
      sources: [
        {kind: 'party', sha256: 'a'.repeat(64)},
        {kind: 'pc', sha256: 'b'.repeat(64)},
      ],
      team: [{uuid: 'u1', usefulMoveIds: ['cobblemon:rocktomb', 'cobblemon:bulldoze', 'cobblemon:earthquake']}],
      levelCap: 15,
      jobId: 'job-1',
    });
  });

  it('cap desconhecido vai como nulo e não há pedido sem time', () => {
    expect(buildEvolutionPlanRequest(snapshot, {team}, null)?.levelCap).toBeNull();
    expect(buildEvolutionPlanRequest(snapshot, {team: []}, 15)).toBeNull();
    expect(buildEvolutionPlanRequest(snapshot, {team}, null)).not.toHaveProperty('jobId');
  });
});

describe('textos das evoluções', () => {
  it('requisito sem dado capturado continua "não verificado"', () => {
    expect(evolutionRequirementStatusLabel('cumprido')).toBe('cumprido');
    expect(evolutionRequirementStatusLabel('pendente')).toBe('pendente');
    expect(evolutionRequirementStatusLabel('não verificado')).toBe('não verificado');
  });

  it('alcance e método têm rótulos para todos os casos, inclusive cap desconhecido', () => {
    expect(evolutionReachLabel(true)).toBe('Cabe no cap');
    expect(evolutionReachLabel(false)).toBe('Passa do cap');
    expect(evolutionReachLabel(null)).toBe('Alcance não verificado');
    expect(evolutionMethodLabel('level_up')).toBe('Por nível');
    expect(evolutionMethodLabel('item_interact')).toBe('Com item');
    expect(evolutionMethodLabel('trade')).toBe('Por troca');
  });

  it('descreve cada tipo de mudança de golpe', () => {
    expect(evolutionMoveChangeKindLabel('atrasado')).toBe('Chega mais tarde');
    expect(evolutionMoveChangeKindLabel('perdido')).toBe('Perde o golpe');
    expect(evolutionMoveChangeKindLabel('adiantado')).toBe('Chega mais cedo');
  });

  it('conta evolui, sem evolução e bloqueados separadamente', () => {
    const member = (status: EvolutionPlanMemberResult['status']) =>
      ({
        uuid: status,
        speciesId: 's',
        formId: 'normal',
        level: 1,
        status,
        blockedReason: null,
        options: [],
      }) satisfies EvolutionPlanMemberResult;
    expect(evolutionSummary([member('evolui'), member('evolui'), member('sem-evolução'), member('bloqueado')])).toEqual({
      evolving: 2,
      none: 1,
      blocked: 1,
    });
  });
});
