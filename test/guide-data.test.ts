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
  team: {speciesId: string; level: number; moves: string[]; ability: string | null; nature: string | null; heldItem: string | null}[];
  source: {jar: string; sha256: string; file: string};
}[] = read('trainers.json');

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
        if (pokemon.heldItem !== null) expect(pokemon.heldItem, trainer.id).toMatch(namespaced);
      }
    }
    const brock = trainers.find((trainer) => trainer.name === 'Leader Brock');
    expect(brock?.team.length).toBeGreaterThan(0);
  });
});
