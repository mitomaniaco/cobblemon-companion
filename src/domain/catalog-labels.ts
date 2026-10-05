import {moveDisplay, titleCaseId} from './dex';

// Catálogo compatível em chunk próprio, fora do bundle principal.
const {default: catalogJson} = await import('../../electron/lib/combat-compatibility.json');

type LabelCatalog = {
  items: Record<string, {name: string}>;
};

const catalog = catalogJson as unknown as LabelCatalog;

/**
 * Nome do item no catálogo compatível, ou `null` se o id não mapeia. Mesma regra do adaptador do cálculo:
 * `cobblemon:focus_sash` vira `focussash`; outro namespace ou id fora do catálogo não mapeia.
 */
export function heldItemCatalogName(id: string): string | null {
  if (!id.startsWith('cobblemon:')) return null;
  const key = id.slice('cobblemon:'.length).replace(/_/g, '');
  const name = Object.hasOwn(catalog.items, key) ? catalog.items[key].name : undefined;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

/** Nome do golpe: catálogo compatível, depois dados do Showdown (corrige `Calmmind` → `Calm Mind`), depois o id em title case. */
export function moveLabel(id: string): string {
  return moveDisplay(id).name;
}

export function itemLabel(id: string): string {
  return heldItemCatalogName(id) ?? titleCaseId(id);
}
