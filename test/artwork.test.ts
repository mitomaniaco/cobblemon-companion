import {describe, expect, it} from 'vitest';
import {artworkFallbackName, buildArtworkIndex, normalizeSpeciesKey, resolveArtwork, type ArtworkManifest} from '../src/ui/artwork';

const manifest: ArtworkManifest = {
  'cobblemon:bulbasaur': {dexNumber: 1, artworkPath: '/pokemon/1.png', shinyPath: '/pokemon/shiny/1.png'},
  'cobblemon:mr-mime': {
    dexNumber: 122,
    artworkPath: '/pokemon/122.png',
    shinyPath: null,
    forms: {galar: {artworkPath: '/pokemon/forms/mr-mime-galar.png', shinyPath: '/pokemon/forms/shiny/mr-mime-galar.png'}},
  },
  'cobblemon:nidoran-f': {dexNumber: 29, artworkPath: '/pokemon/29.png'},
  'cobblemon:vulpix': {
    dexNumber: 37,
    artworkPath: '/pokemon/37.png',
    shinyPath: '/pokemon/shiny/37.png',
    forms: {alola: {artworkPath: '/pokemon/forms/vulpix-alola.png', shinyPath: null}},
  },
  'cobblemon:missing': {dexNumber: 999, artworkPath: null},
};
const index = buildArtworkIndex(manifest);
const resolve = (speciesId: string, formId: string, shiny = false) => resolveArtwork(manifest, index, speciesId, formId, shiny);

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
    expect(resolve('cobblemon:bulbasaur', 'normal')).toEqual({path: '/pokemon/1.png', source: 'exact', shiny: 'normal'});
  });

  it('acha pelo nome normalizado quando o id do catálogo diverge do manifesto', () => {
    expect(resolve('cobblemon:mrmime', 'normal')).toMatchObject({path: '/pokemon/122.png', source: 'name'});
    expect(resolve('cobblemon:nidoranf', 'normal')).toMatchObject({path: '/pokemon/29.png', source: 'name'});
  });

  it('forma com arte própria usa essa arte, achada pelo formId em qualquer caixa', () => {
    expect(resolve('cobblemon:vulpix', 'alola')).toEqual({path: '/pokemon/forms/vulpix-alola.png', source: 'form', shiny: 'normal'});
    expect(resolve('cobblemon:vulpix', 'Alola')).toMatchObject({source: 'form'});
    expect(resolve('cobblemon:mrmime', 'Galar')).toMatchObject({path: '/pokemon/forms/mr-mime-galar.png', source: 'form'});
  });

  it('forma sem arte própria ou desconhecida usa a forma normal, sempre marcada como base-form', () => {
    expect(resolve('cobblemon:bulbasaur', 'alolan')).toEqual({path: '/pokemon/1.png', source: 'base-form', shiny: 'normal'});
    expect(resolve('cobblemon:bulbasaur', 'unknown')).toMatchObject({path: '/pokemon/1.png', source: 'base-form'});
    expect(resolve('cobblemon:vulpix', 'hisui')).toMatchObject({path: '/pokemon/37.png', source: 'base-form'});
  });

  it('shiny usa a arte shiny da mesma variante', () => {
    expect(resolve('cobblemon:bulbasaur', 'normal', true)).toEqual({path: '/pokemon/shiny/1.png', source: 'exact', shiny: 'shiny'});
    expect(resolve('cobblemon:mr-mime', 'galar', true)).toEqual({
      path: '/pokemon/forms/shiny/mr-mime-galar.png',
      source: 'form',
      shiny: 'shiny',
    });
  });

  it('shiny sem arte shiny mostra a arte normal marcada como shiny-missing, nunca a shiny de outra variante', () => {
    expect(resolve('cobblemon:mr-mime', 'normal', true)).toEqual({path: '/pokemon/122.png', source: 'exact', shiny: 'shiny-missing'});
    expect(resolve('cobblemon:nidoran-f', 'normal', true)).toMatchObject({path: '/pokemon/29.png', shiny: 'shiny-missing'});
    // Forma Alola tem arte normal mas não shiny: não cai na shiny da forma normal (seria a forma errada).
    expect(resolve('cobblemon:vulpix', 'alola', true)).toEqual({
      path: '/pokemon/forms/vulpix-alola.png',
      source: 'form',
      shiny: 'shiny-missing',
    });
  });

  it('sem arte (espécie ausente ou com caminho nulo) não inventa imagem de outra espécie', () => {
    expect(resolve('cobblemon:missing', 'normal')).toEqual({path: null, source: 'none', shiny: 'normal'});
    expect(resolve('cobblemon:unlisted', 'normal', true)).toEqual({path: null, source: 'none', shiny: 'shiny-missing'});
    expect(resolve('cobblemon:unlisted', 'alolan')).toEqual({path: null, source: 'none', shiny: 'normal'});
    expect(resolveArtwork({}, buildArtworkIndex({}), 'cobblemon:bulbasaur', 'normal', false).path).toBeNull();
  });

  it('o índice ignora entradas sem nenhuma arte', () => {
    expect(index.has('missing')).toBe(false);
    expect(index.get('bulbasaur')?.artworkPath).toBe('/pokemon/1.png');
  });
});

describe('nome do placeholder', () => {
  it('deriva um nome legível do id, sem namespace', () => {
    expect(artworkFallbackName('cobblemon:mr_mime')).toBe('Mr Mime');
    expect(artworkFallbackName('mega_showdown:venusaur-mega')).toBe('Venusaur Mega');
    expect(artworkFallbackName('pikachu')).toBe('Pikachu');
  });
});
