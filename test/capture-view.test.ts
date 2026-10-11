import {describe, expect, it} from 'vitest';
import {
  captureGapStatus,
  captureRequirementLabel,
  captureRequirementTone,
  captureSpawnSummary,
  orderCaptureCandidates,
} from '../src/features/guide/capture-model';
import type {CaptureCandidate, CaptureGap, CaptureSpawn} from '../src/platform/api';

const spawn = (patch: Partial<CaptureSpawn>): CaptureSpawn => ({
  biomes: ['River'],
  conditions: [],
  levelMin: 10,
  levelMax: 20,
  bucket: 'common',
  position: 'surface',
  ...patch,
});

const candidate = (speciesId: string, catchable: CaptureCandidate['catchable']): CaptureCandidate => ({
  speciesId,
  reason: 'x',
  spawns: [spawn({})],
  catchable,
  catchableReason: 'y',
  requirements: [],
});

const gap = (owned: number, candidates: CaptureCandidate[]): CaptureGap => ({
  opponentId: 'o',
  speciesId: 'cobblemon:floatzel',
  level: 30,
  owned: Array.from({length: owned}, (_, index) => ({uuid: `u${index}`, speciesId: 's', level: 30, container: 'pc' as const, reason: 'r'})),
  candidates,
  note: null,
});

describe('requisitos de captura em português de jogador', () => {
  it('troca o id da conquista pela região, sem o texto técnico', () => {
    const label = captureRequirementLabel({kind: 'pika-star', text: 'advancement Pika Star de paldea (allthemons:<região>_pika_star)'});
    expect(label).toBe('Pika Star de Paldea');
    expect(
      captureRequirementLabel({kind: 'pika-star', text: 'advancement Pika Star de kanto ou paldea (allthemons:<região>_pika_star)'}),
    ).toBe('Pika Star de Kanto ou Paldea');
  });

  it('resume o nível só pelo teto, sem a explicação da origem', () => {
    expect(
      captureRequirementLabel({
        kind: 'nível',
        text: 'alvo até o nível 30 (nível do primeiro Pokémon da party, supondo que não esteja desmaiado)',
      }),
    ).toBe('Nível: até Nv. 30');
  });

  it('não afirma cumprido sem verificar: só cumprido é verde', () => {
    expect(captureRequirementTone('cumprido')).toBe('ok');
    expect(captureRequirementTone('pendente')).toBe('warn');
    expect(captureRequirementTone('não verificado')).toBe('muted');
  });
});

describe('resumo dos spawns', () => {
  it('une faixa de nível, biomas e condições sem repetir, e usa a raridade mais comum', () => {
    const summary = captureSpawnSummary([
      spawn({levelMin: 25, levelMax: 30, bucket: 'rare', biomes: ['River', 'Swamp'], conditions: ['com chuva']}),
      spawn({levelMin: 20, levelMax: 28, bucket: 'uncommon', biomes: ['Swamp'], conditions: ['com chuva', 'de noite']}),
    ]);
    expect(summary).toEqual({
      levelMin: 20,
      levelMax: 30,
      bucket: 'uncommon',
      biomes: ['River', 'Swamp'],
      conditions: ['com chuva', 'de noite'],
    });
  });

  it('sem spawn conhecido não inventa local', () => {
    expect(captureSpawnSummary([])).toBeNull();
  });
});

describe('ordem e situação das lacunas', () => {
  it('põe o que dá para capturar agora primeiro, mantendo a ordem do plano dentro do mesmo estado', () => {
    const ordered = orderCaptureCandidates([
      candidate('a', 'bloqueada'),
      candidate('b', 'depende-do-nível'),
      candidate('c', 'liberada'),
      candidate('d', 'depende-do-nível'),
      candidate('e', 'liberada'),
    ]);
    expect(ordered.map((item) => item.speciesId)).toEqual(['c', 'e', 'b', 'd', 'a']);
  });

  it('quem já tem resposta vence candidato; sem nada, a lacuna fica descoberta', () => {
    expect(captureGapStatus(gap(1, [candidate('a', 'liberada')]))).toBe('owned');
    expect(captureGapStatus(gap(0, [candidate('a', 'depende-do-nível'), candidate('b', 'liberada')]))).toBe('catchable');
    expect(captureGapStatus(gap(0, [candidate('a', 'bloqueada')]))).toBe('pending');
    expect(captureGapStatus(gap(0, []))).toBe('none');
  });
});
