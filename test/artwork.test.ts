import {describe, expect, it} from 'vitest';
import {artworkFallbackName, buildArtworkIndex, normalizeSpeciesKey, resolveArtwork, type ArtworkManifest} from '../src/ui/artwork';

const manifest: ArtworkManifest = {
  'cobblemon:bulbasaur': {dexNumber: 1, artworkPath: '/pokemon/1.png'},
  'cobblemon:mr-mime': {dexNumber: 122, artworkPath: '/pokemon/122.png'},
  'cobblemon:nidoran-f': {dexNumber: 29, artworkPath: '/pokemon/29.png'},
  'cobblemon:missing': {dexNumber: 999, artworkPath: null},
};
const index = buildArtworkIndex(manifest);

describe('chave normalizada de espécie', () => {
  it('ignora namespace, caixa e separadores', () => {
    expect(normalizeSpeciesKey('cobblemon:mr_mime')).toBe('mrmime');
    expect(normalizeSpeciesKey('cobblemon:mr-mime')).toBe('mrmime');
    expect(normalizeSpeciesKey('mega_showdown:Ho-Oh')).toBe('hooh');
    expect(normalizeSpeciesKey('nidoranf')).toBe('nidoranf');
  });
});

describe('resolução da imagem', () => {
  it('usa a arte exata da espécie na forma normal', () => {
    expect(resolveArtwork(manifest, index, 'cobblemon:bulbasaur', 'normal')).toEqual({path: '/pokemon/1.png', source: 'exact'});
  });

  it('acha pelo nome normalizado quando o id do catálogo diverge do manifesto', () => {
    expect(resolveArtwork(manifest, index, 'cobblemon:mrmime', 'normal')).toEqual({path: '/pokemon/122.png', source: 'name'});
    expect(resolveArtwork(manifest, index, 'cobblemon:nidoranf', 'normal')).toEqual({path: '/pokemon/29.png', source: 'name'});
  });

  it('forma alternativa ou desconhecida usa a arte da forma normal, sempre marcada como base-form', () => {
    expect(resolveArtwork(manifest, index, 'cobblemon:bulbasaur', 'alolan')).toEqual({path: '/pokemon/1.png', source: 'base-form'});
    expect(resolveArtwork(manifest, index, 'cobblemon:bulbasaur', 'unknown')).toEqual({path: '/pokemon/1.png', source: 'base-form'});
    expect(resolveArtwork(manifest, index, 'cobblemon:mrmime', 'galarian').source).toBe('base-form');
  });

  it('sem arte (espécie ausente ou com caminho nulo) não inventa imagem de outra espécie', () => {
    expect(resolveArtwork(manifest, index, 'cobblemon:missing', 'normal')).toEqual({path: null, source: 'none'});
    expect(resolveArtwork(manifest, index, 'cobblemon:unlisted', 'normal')).toEqual({path: null, source: 'none'});
    expect(resolveArtwork(manifest, index, 'cobblemon:unlisted', 'alolan')).toEqual({path: null, source: 'none'});
    expect(resolveArtwork({}, buildArtworkIndex({}), 'cobblemon:bulbasaur', 'normal')).toEqual({path: null, source: 'none'});
  });

  it('o índice ignora entradas sem arte', () => {
    expect(index.has('missing')).toBe(false);
    expect(index.get('bulbasaur')).toBe('/pokemon/1.png');
  });
});

describe('nome do placeholder', () => {
  it('deriva um nome legível do id, sem namespace', () => {
    expect(artworkFallbackName('cobblemon:mr_mime')).toBe('Mr Mime');
    expect(artworkFallbackName('mega_showdown:venusaur-mega')).toBe('Venusaur Mega');
    expect(artworkFallbackName('pikachu')).toBe('Pikachu');
  });
});
