import {describe, expect, it} from 'vitest';
import {trainingEvBars, trainingMovesByLevel, trainingTrack} from '../src/features/guide/training-model';
import type {TrainingMove, TrainingStatKey} from '../src/platform/api';

const move = (moveId: string, level: number): TrainingMove => ({moveId, level, useful: true});

describe('trainingTrack', () => {
  it('sem nível-alvo ou com alvo abaixo do atual não há caminho', () => {
    expect(trainingTrack({level: 24, targetLevel: null, moves: []})).toBeNull();
    expect(trainingTrack({level: 31, targetLevel: 30, moves: []})).toBeNull();
  });

  it('mostra todos os níveis em caminhos curtos e posiciona de 0 a 1', () => {
    const nodes = trainingTrack({level: 24, targetLevel: 30, moves: [move('psychic', 26)]}) ?? [];
    expect(nodes.map((node) => node.level)).toEqual([24, 25, 26, 27, 28, 29, 30]);
    expect(nodes[0]).toMatchObject({position: 0, isStart: true, isEnd: false});
    expect(nodes[6]).toMatchObject({position: 1, isStart: false, isEnd: true});
    expect(nodes[2].moves.map((entry) => entry.moveId)).toEqual(['psychic']);
  });

  it('em caminhos longos mantém só início, alvo e níveis com golpe, juntando golpes do mesmo nível', () => {
    const nodes = trainingTrack({level: 10, targetLevel: 40, moves: [move('a', 20), move('b', 20), move('c', 33)]}) ?? [];
    expect(nodes.map((node) => node.level)).toEqual([10, 20, 33, 40]);
    expect(nodes[1].moves.map((entry) => entry.moveId)).toEqual(['a', 'b']);
    expect(nodes[1].position).toBeCloseTo(1 / 3);
  });

  it('já no alvo gera um único marcador que é início e alvo; golpes fora do intervalo ficam presos às pontas', () => {
    const atTarget = trainingTrack({level: 21, targetLevel: 21, moves: []}) ?? [];
    expect(atTarget).toHaveLength(1);
    expect(atTarget[0]).toMatchObject({position: 0, isStart: true, isEnd: true});
    const clamped = trainingTrack({level: 10, targetLevel: 30, moves: [move('x', 5), move('y', 45)]}) ?? [];
    expect(clamped[0].moves.map((entry) => entry.moveId)).toEqual(['x']);
    expect(clamped.at(-1)?.moves.map((entry) => entry.moveId)).toEqual(['y']);
  });
});

describe('trainingMovesByLevel', () => {
  it('ordena por nível sem alterar a lista original', () => {
    const input = [move('b', 30), move('a', 12)];
    expect(trainingMovesByLevel(input).map((entry) => entry.moveId)).toEqual(['a', 'b']);
    expect(input[0].moveId).toBe('b');
  });
});

describe('trainingEvBars', () => {
  const zero: Record<TrainingStatKey, number | null> = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};

  it('devolve os seis atributos na ordem do jogo e marca só os sugeridos como foco', () => {
    const bars = trainingEvBars({currentEvs: {...zero, spa: 84}, suggestedEvs: {spa: 252, spe: 126}});
    expect(bars.map((bar) => bar.stat)).toEqual(['hp', 'atk', 'def', 'spa', 'spd', 'spe']);
    expect(bars.filter((bar) => bar.state === 'focus').map((bar) => bar.stat)).toEqual(['spa', 'spe']);
    expect(bars[3]).toMatchObject({current: 84, suggested: 252, suggestedRatio: 1});
    expect(bars[3].currentRatio).toBeCloseTo(84 / 252);
    expect(bars[5].suggestedRatio).toBeCloseTo(0.5);
  });

  it('EV atual desconhecido continua null e nunca preenche a barra', () => {
    const bars = trainingEvBars({currentEvs: {...zero, atk: null}, suggestedEvs: {}});
    expect(bars[1]).toMatchObject({current: null, currentRatio: 0, state: 'idle'});
  });

  it('limita a razão a 1 se o motor devolver acima de 252', () => {
    const bars = trainingEvBars({currentEvs: {...zero, hp: 300}, suggestedEvs: {hp: 400}});
    expect(bars[0]).toMatchObject({currentRatio: 1, suggestedRatio: 1});
  });
});
