import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const read = (name: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/guide', name), 'utf8'));
const manifestSlugs = Object.keys(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/compat/manifest.json'), 'utf8')).species);

const learnsets: Record<string, {levelUp: {level: number; moveId: string}[]; tm: string[]; tutor: string[]; egg: string[]}> =
  read('learnsets.json');
const evolutions: Record<string, {to: string; method: string; requirement: string}[]> = read('evolutions.json');
const trainers: {
  id: string;
  name: string;
  format: string;
  team: {speciesId: string; level: number; moves: string[]; ability: string | null; nature: string | null; heldItem: string[] | null}[];
  bag: {item: string; quantity: number}[];
  battleRules: {maxItemUses: number | null};
  ai: {type: string} | null;
  mob: {type: string | null; signatureItem: string | null; optional: boolean} | null;
  source: {jar: string; sha256: string; file: string};
}[] = read('trainers.json');

type SeriesNode = {type: string | null; optional: boolean; requires: string[][]; via: string};
const series: Record<string, {trainerIds: string[]; order: string[]; graph: Record<string, SeriesNode>}> = read('series.json');

type Stage = {
  stageId: string;
  name: string;
  type: string | null;
  order: number;
  requires: string[];
  capBefore: number | null;
  capAfter: number | null;
  capUnknownReason: string | null;
  ambiguous: boolean;
  ambiguousReason: string | null;
  variants: {id: string; format: string; maxLevel: number; teamSize: number; optional: boolean}[];
};
const campaign: Record<
  string,
  {levelCapRule: {initialLevelCap: number; relativeLevelCap: number}; stages: Stage[]; optionalTrainerIds: string[]}
> = read('campaign.json');

const namespaced = /^[a-z0-9_.-]+:[a-z0-9_/.-]+$/;

describe('dados do guia', () => {
  it('learnsets e evoluções cobrem exatamente as espécies do manifesto', () => {
    expect(Object.keys(learnsets).sort()).toEqual([...manifestSlugs].sort());
    expect(Object.keys(evolutions).sort()).toEqual([...manifestSlugs].sort());
  });

  it('learnsets têm níveis 1–100 e ids com namespace', () => {
    for (const [slug, learnset] of Object.entries(learnsets)) {
      for (const {level, moveId} of learnset.levelUp) {
        expect(Number.isInteger(level) && level >= 1 && level <= 100, `${slug} nível ${level}`).toBe(true);
        expect(moveId, slug).toMatch(namespaced);
      }
      for (const moveId of [...learnset.tm, ...learnset.tutor, ...learnset.egg]) expect(moveId, slug).toMatch(namespaced);
    }
    expect(learnsets.abra.levelUp.length).toBeGreaterThan(0);
  });

  it('evoluções apontam para espécies com namespace e descrevem método e requisito', () => {
    for (const [slug, list] of Object.entries(evolutions)) {
      for (const evolution of list) {
        expect(evolution.to, slug).toMatch(namespaced);
        expect(evolution.method, slug).not.toBe('');
        expect(typeof evolution.requirement, slug).toBe('string');
      }
    }
    expect(evolutions.abra.map((evolution) => evolution.to)).toEqual(['cobblemon:kadabra']);
  });

  it('treinadores têm time, níveis 1–100, ids com namespace e origem rastreável', () => {
    expect(new Set(trainers.map((trainer) => trainer.id)).size).toBe(trainers.length);
    for (const trainer of trainers) {
      expect(['singles', 'doubles', 'unknown'], trainer.id).toContain(trainer.format);
      expect(trainer.team.length, trainer.id).toBeGreaterThan(0);
      expect(trainer.source.sha256, trainer.id).toMatch(/^[0-9a-f]{64}$/);
      for (const pokemon of trainer.team) {
        expect(pokemon.speciesId, trainer.id).toMatch(namespaced);
        expect(pokemon.level >= 1 && pokemon.level <= 100, `${trainer.id} nível ${pokemon.level}`).toBe(true);
        for (const moveId of pokemon.moves) expect(moveId, trainer.id).toMatch(namespaced);
        if (pokemon.heldItem !== null) {
          expect(pokemon.heldItem.length, trainer.id).toBeGreaterThan(0);
          for (const item of pokemon.heldItem) expect(item, trainer.id).toMatch(namespaced);
        }
      }
    }
    for (const trainer of trainers) {
      for (const entry of trainer.bag) {
        expect(entry.item, trainer.id).toMatch(namespaced);
        expect(entry.quantity, trainer.id).toBeGreaterThan(0);
      }
    }
    const brock = trainers.find((trainer) => trainer.name === 'Leader Brock');
    expect(brock?.team.length).toBeGreaterThan(0);
  });

  it('treinadores sem battleFormat na fonte são singles', () => {
    expect(trainers.find((trainer) => trainer.id === 'rctmod:leader_brock_019e')?.format).toBe('singles');
    expect(trainers.some((trainer) => trainer.format === 'doubles')).toBe(true);
  });

  it('Brock: bolsa, regras, IA, tipo do mob e itens como lista', () => {
    const brock = trainers.find((trainer) => trainer.id === 'rctmod:leader_brock_019e');
    expect(brock?.bag).toEqual([{item: 'cobblemon:potion', quantity: 1}]);
    expect(brock?.battleRules.maxItemUses).toBe(2);
    expect(brock?.ai?.type).toBe('rct');
    expect(brock?.mob).toMatchObject({type: 'leader', signatureItem: 'cobblemon:hard_stone'});
    expect(brock?.team[0].heldItem).toEqual(['cobblemon:custap_berry']);
    expect(trainers.some((trainer) => trainer.team.some((pokemon) => (pokemon.heldItem?.length ?? 0) > 1))).toBe(true);
  });

  it('trainers do KubeJS entram com origem kubejs/data e suas séries existem', () => {
    expect(trainers.some((trainer) => trainer.source.jar === 'kubejs/data')).toBe(true);
    expect(Object.keys(series)).toEqual(expect.arrayContaining(['atm_team', 'contentcreators']));
  });

  it('séries listam treinadores existentes em ordem consistente com os pré-requisitos', () => {
    const known = new Set(trainers.map((trainer) => trainer.id));
    expect(Object.keys(series)).toContain('radicalred');
    for (const [seriesId, entry] of Object.entries(series)) {
      expect([...entry.order].sort(), seriesId).toEqual([...entry.trainerIds].sort());
      expect(Object.keys(entry.graph).sort(), seriesId).toEqual([...entry.trainerIds].sort());
      const position = new Map(entry.order.map((id, index) => [id, index]));
      for (const id of entry.trainerIds) {
        expect(known.has(id), `${seriesId} ${id}`).toBe(true);
        for (const group of entry.graph[id].requires) {
          expect(group.length, id).toBeGreaterThan(0);
          const inSeries = group.filter((dependency) => position.has(dependency));
          if (inSeries.length > 0)
            expect(Math.min(...inSeries.map((dependency) => position.get(dependency) as number)), id).toBeLessThan(
              position.get(id) as number,
            );
        }
      }
    }
    expect(series.radicalred.trainerIds).toContain('rctmod:leader_brock_019e');
  });

  it('campanha: etapas ordenadas, variantes existentes e dependências só para trás', () => {
    const known = new Set(trainers.map((trainer) => trainer.id));
    expect(Object.keys(campaign)).toEqual(expect.arrayContaining(['radicalred']));
    for (const [seriesId, entry] of Object.entries(campaign)) {
      const index = new Map(entry.stages.map((stage, position) => [stage.stageId, position]));
      expect(index.size, seriesId).toBe(entry.stages.length);
      entry.stages.forEach((stage, position) => {
        expect(stage.order, stage.stageId).toBe(position);
        expect(stage.variants.length, stage.stageId).toBeGreaterThan(0);
        expect(stage.ambiguous, stage.stageId).toBe(stage.variants.length > 1);
        expect(stage.ambiguousReason === null, stage.stageId).toBe(!stage.ambiguous);
        for (const variant of stage.variants) {
          expect(known.has(variant.id), variant.id).toBe(true);
          expect(variant.maxLevel >= 1 && variant.maxLevel <= 100 && variant.teamSize > 0, variant.id).toBe(true);
        }
        for (const required of stage.requires)
          expect(index.get(required) ?? Number.POSITIVE_INFINITY, stage.stageId).toBeLessThan(position);
      });
      const staged = entry.stages.flatMap((stage) => stage.variants.map((variant) => variant.id));
      expect(new Set([...staged, ...entry.optionalTrainerIds]).size, seriesId).toBe(staged.length + entry.optionalTrainerIds.length);
    }
  });

  it('campanha radicalred: Brock abre, Misty exige o rival (3 variantes) e o campeão exige a Elite 4', () => {
    const stages = campaign.radicalred.stages;
    expect(stages[0].variants.map((variant) => variant.id)).toEqual(['rctmod:leader_brock_019e']);
    const rival = stages.find((stage) => stage.name === 'Rival Terry · 1º encontro');
    expect(rival?.variants.map((variant) => variant.id)).toEqual([
      'rctmod:rival_terry_014c',
      'rctmod:rival_terry_014d',
      'rctmod:rival_terry_014e',
    ]);
    expect(rival?.ambiguous).toBe(true);
    expect(stages.find((stage) => stage.name === 'Leader Misty')?.requires).toEqual([rival?.stageId]);
    const champion = stages.find((stage) => stage.type === 'champ');
    expect(champion?.requires.length).toBe(4);
    expect(stages.find((stage) => stage.name === 'Elite Four Lorelei')?.variants.every((variant) => variant.format === 'doubles')).toBe(
      true,
    );
  });

  it('level cap por etapa segue a regra do mod (LevelUtils.levelCap)', () => {
    for (const [seriesId, entry] of Object.entries(campaign)) {
      for (const stage of entry.stages) {
        expect(stage.capUnknownReason === null, `${seriesId} ${stage.stageId}`).toBe(stage.capBefore !== null);
        expect(stage.capUnknownReason === null, stage.stageId).toBe(stage.capAfter !== null);
        if (stage.capBefore !== null && stage.capAfter !== null) {
          expect(stage.capBefore >= entry.levelCapRule.initialLevelCap && stage.capBefore <= 100, stage.stageId).toBe(true);
          expect(stage.capAfter >= entry.levelCapRule.initialLevelCap && stage.capAfter <= 100, stage.stageId).toBe(true);
        }
      }
    }
    const radical = campaign.radicalred;
    expect(radical.levelCapRule).toMatchObject({initialLevelCap: 15, relativeLevelCap: 0});
    const [brock, archer] = radical.stages;
    // Brock (nível 14) abaixo do piso 15: cap 15; vencê-lo libera o Archer (nível 21).
    expect([brock.capBefore, brock.capAfter]).toEqual([15, 21]);
    expect(archer.capBefore).toBe(21);
    const champion = radical.stages.find((stage) => stage.type === 'champ');
    expect(champion?.capAfter).toBe(100);
  });
});
