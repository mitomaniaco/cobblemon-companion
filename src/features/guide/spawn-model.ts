import type {GuideTrainerDetail} from '../../platform/api';

const BIOME_TAG_LABELS: Readonly<Record<string, string>> = {
  'has_structure/ancient_city': 'Cidade Antiga',
  'has_structure/desert_pyramid': 'Pirâmide do Deserto',
  'has_structure/end_city': 'Cidade do End',
  'has_structure/jungle_temple': 'Templo da Selva',
  'has_structure/nether_fortress': 'Fortaleza do Nether',
  is_badlands: 'Badlands',
  is_beach: 'Praia',
  is_cave: 'Caverna',
  is_cold: 'Biomas frios',
  is_dense_vegetation: 'Vegetação densa',
  is_end: 'The End',
  is_forest: 'Floresta',
  is_hill: 'Colinas',
  is_hot: 'Biomas quentes',
  is_jungle: 'Selva',
  is_lush: 'Biomas exuberantes',
  is_mountain: 'Montanha',
  is_nether: 'Nether',
  is_peak: 'Picos',
  is_plains: 'Planície',
  is_plateau: 'Planalto',
  is_rare: 'Biomas raros',
  is_river: 'Rio',
  is_savanna: 'Savana',
  is_sparse_vegetation: 'Vegetação esparsa',
  is_spooky: 'Biomas sombrios',
  is_swamp: 'Pântano',
  is_underground: 'Subterrâneo',
  is_wasteland: 'Terras devastadas',
  is_water: 'Água',
  is_wet: 'Biomas úmidos',
  is_void: 'Vazio',
};

/** Nome legível de uma tag de bioma do RCT; tag fora do mapa vira texto derivado do próprio id. */
export function biomeTagLabel(tag: string): string {
  const id = tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag;
  const known = BIOME_TAG_LABELS[id];
  if (known !== undefined) return known;
  if (id.startsWith('has_structure/')) return `Estrutura ${id.slice('has_structure/'.length).replaceAll('_', ' ')}`;
  return id.replace(/^is_/, '').replaceAll('_', ' ');
}

/** Linhas de "Como encontrar" do treinador; nulo quando o pacote do RCT não traz dados de spawn. */
export function spawnLines(spawn: GuideTrainerDetail['spawn']): {item: string | null; biomes: string; excluded: string} | null {
  if (spawn === null) return null;
  return {
    item: spawn.signatureItem,
    biomes: spawn.biomes.map(biomeTagLabel).join(', '),
    excluded: spawn.excludedBiomes
      .filter((tag) => !/^(?:[^:]*:)?is_void$/.test(tag))
      .map(biomeTagLabel)
      .join(', '),
  };
}
