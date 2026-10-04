import catalogJson from '../../electron/lib/combat-compatibility.json';

type LabelCatalog = {
  moves: Record<string, {name: string}>;
  items: Record<string, {name: string}>;
};

const catalog = catalogJson as unknown as LabelCatalog;

/** Rótulo de um id importado do save sem passar pelo catálogo: tira o namespace e põe cada palavra em maiúscula. */
export function titleCaseId(id: string): string {
  return id
    .replace(/^[^:]+:/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/**
 * Nome do item no catálogo compatível, ou `null` se o id não mapeia. Mesma regra do adaptador do cálculo:
 * `cobblemon:focus_sash` vira `focussash`; outro namespace ou id fora do catálogo não mapeia.
 */
export function heldItemCatalogName(id: string): string | null {
  if (!id.startsWith('cobblemon:')) return null;
  const name = catalog.items[id.slice('cobblemon:'.length).replace(/_/g, '')]?.name;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

export function moveLabel(id: string): string {
  return catalog.moves[id]?.name ?? titleCaseId(id);
}

export function itemLabel(id: string): string {
  return heldItemCatalogName(id) ?? titleCaseId(id);
}
