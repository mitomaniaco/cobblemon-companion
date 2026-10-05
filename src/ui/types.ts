const TYPE_LABELS: Record<string, string> = {
  normal: 'Normal',
  fire: 'Fogo',
  water: 'Água',
  electric: 'Elétrico',
  grass: 'Planta',
  ice: 'Gelo',
  fighting: 'Lutador',
  poison: 'Venenoso',
  ground: 'Terrestre',
  flying: 'Voador',
  psychic: 'Psíquico',
  bug: 'Inseto',
  rock: 'Pedra',
  ghost: 'Fantasma',
  dragon: 'Dragão',
  dark: 'Sombrio',
  steel: 'Metálico',
  fairy: 'Fada',
};

function knownType(type: string | null): string | null {
  const key = type?.toLowerCase() ?? '';
  return key in TYPE_LABELS ? key : null;
}

export function typeColorVar(type: string | null): string {
  const key = knownType(type);
  return key ? `var(--type-${key})` : 'var(--color-raised)';
}

export function typeInkVar(type: string | null): string {
  const key = knownType(type);
  return key ? `var(--type-${key}-ink)` : 'var(--color-text)';
}

export function typeLabel(type: string): string {
  return TYPE_LABELS[type.toLowerCase()] ?? type;
}
