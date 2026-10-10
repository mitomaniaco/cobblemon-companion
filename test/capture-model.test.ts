import {describe, expect, it} from 'vitest';
import {
  buildCapturePlanRequest,
  captureBucketLabel,
  captureCatchableLabel,
  captureFirstPartyLevelLabel,
  captureLevelRangeLabel,
  captureOwnedWhereLabel,
  guideGapOpponentIds,
} from '../src/features/guide/capture-model';
import type {GuideResult, PlayerSnapshot} from '../src/platform/api';

const snapshot = {
  sources: [
    {kind: 'party', sha256: 'a'.repeat(64), modifiedAt: '2026-10-05T00:00:00Z'},
    {kind: 'pc', sha256: 'b'.repeat(64), modifiedAt: '2026-10-05T00:00:00Z'},
  ],
} as unknown as PlayerSnapshot;

const opponents: GuideResult['opponents'] = [
  {id: 'o0', speciesId: 'cobblemon:lanturn', level: 20, trainerId: 'misty'},
  {id: 'o1', speciesId: 'cobblemon:starmie', level: 22, trainerId: 'misty'},
  {id: 'o2', speciesId: 'cobblemon:golduck', level: 21, trainerId: 'misty'},
];

const member = (uuid: string, matchups: GuideResult['team'][number]['matchups']): GuideResult['team'][number] => ({
  uuid,
  speciesId: 'cobblemon:pikachu',
  level: 20,
  reason: 'x',
  moves: [],
  item: {id: null, status: 'nenhum', reason: 'y'},
  matchups,
  acquire: [],
});

describe('lacunas do time', () => {
  it('são os adversários que nenhum membro vence, na ordem do guia', () => {
    const team = [
      member('u1', [
        {opponentId: 'o0', outcome: 'perde', ourTurns: 3, theirTurns: 1, moveId: null},
        {opponentId: 'o1', outcome: 'vence', ourTurns: 1, theirTurns: 3, moveId: null},
      ]),
      member('u2', [{opponentId: 'o2', outcome: 'perde', ourTurns: 3, theirTurns: 2, moveId: null}]),
    ];
    expect(guideGapOpponentIds({opponents, team})).toEqual(['o0', 'o2']);
  });

  it('adversário sem nenhum confronto calculado também é lacuna, e vencer por qualquer membro fecha a lacuna', () => {
    expect(guideGapOpponentIds({opponents, team: [member('u1', [])]})).toEqual(['o0', 'o1', 'o2']);
    const beaten = (opponentId: string) => ({opponentId, outcome: 'vence' as const, ourTurns: 1, theirTurns: 2, moveId: null});
    expect(guideGapOpponentIds({opponents, team: [member('u1', [beaten('o0')]), member('u2', [beaten('o1'), beaten('o2')])]})).toEqual([]);
  });
});

describe('pedido de capturas', () => {
  const goal = {kind: 'trainer', trainerId: 'misty'} as const;
  const team = [member('u1', [{opponentId: 'o1', outcome: 'vence', ourTurns: 1, theirTurns: 3, moveId: null}])];

  it('leva o objetivo, o time, Pika Star e só as lacunas, com os hashes das fontes', () => {
    const pikaStar = Object.fromEntries(
      ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'hisui', 'paldea'].map((region) => [region, null]),
    ) as Record<'kanto' | 'johto' | 'hoenn' | 'sinnoh' | 'unova' | 'kalos' | 'alola' | 'galar' | 'hisui' | 'paldea', boolean | null>;
    expect(buildCapturePlanRequest(snapshot, {goal, opponents, team}, pikaStar, 'job-1')).toEqual({
      sources: [
        {kind: 'party', sha256: 'a'.repeat(64)},
        {kind: 'pc', sha256: 'b'.repeat(64)},
      ],
      goal,
      teamUuids: ['u1'],
      pikaStar,
      gapOpponentIds: ['o0', 'o2'],
      jobId: 'job-1',
    });
  });

  it('não pede nada sem time ou sem lacuna, e omite jobId quando não há', () => {
    const pikaStar = Object.fromEntries(
      ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'hisui', 'paldea'].map((region) => [region, null]),
    ) as Record<'kanto' | 'johto' | 'hoenn' | 'sinnoh' | 'unova' | 'kalos' | 'alola' | 'galar' | 'hisui' | 'paldea', boolean | null>;
    expect(buildCapturePlanRequest(snapshot, {goal, opponents, team: []}, pikaStar)).toBeNull();
    const beatAll = [
      member(
        'u1',
        opponents.map((opponent) => ({opponentId: opponent.id, outcome: 'vence' as const, ourTurns: 1, theirTurns: 2, moveId: null})),
      ),
    ];
    expect(buildCapturePlanRequest(snapshot, {goal, opponents, team: beatAll}, pikaStar)).toBeNull();
    expect(buildCapturePlanRequest(snapshot, {goal, opponents, team}, pikaStar)).not.toHaveProperty('jobId');
  });
});

describe('textos das capturas', () => {
  it('não afirma captura liberada quando não verificou', () => {
    expect(captureCatchableLabel('liberada')).toBe('Captura liberada');
    expect(captureCatchableLabel('depende-do-nível')).toBe('Depende do nível');
    expect(captureCatchableLabel('bloqueada')).toBe('Captura bloqueada');
    expect(captureCatchableLabel('não verificado')).toBe('Não verificado');
  });

  it('descreve faixa de nível, raridade e onde está quem você já tem', () => {
    expect(captureLevelRangeLabel({levelMin: 5, levelMax: 30})).toBe('Nv. 5–30');
    expect(captureLevelRangeLabel({levelMin: 12, levelMax: 12})).toBe('Nv. 12');
    expect(captureBucketLabel('ultra-rare')).toBe('ultrarraro');
    expect(captureBucketLabel('common')).toBe('comum');
    expect(captureOwnedWhereLabel('party')).toBe('na equipe');
    expect(captureOwnedWhereLabel('pc')).toBe('no PC');
  });

  it('diz que o app não vê quem está desmaiado e trata party vazia', () => {
    expect(captureFirstPartyLevelLabel(15)).toContain('nível 15');
    expect(captureFirstPartyLevelLabel(15)).toContain('desmaiado');
    expect(captureFirstPartyLevelLabel(null)).toContain('Party vazia');
  });
});
