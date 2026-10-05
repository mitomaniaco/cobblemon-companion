type UiIcons = {
  readonly types: Readonly<Record<string, string>>;
  readonly categories: Readonly<Record<string, string>>;
  readonly items: Readonly<Record<string, string>>;
};

// O manifesto é gerado por `npm run prepare:ui-assets` e não é versionado. Sem ele,
// todos os helpers retornam null e os componentes usam os ícones neutros.
const manifests = import.meta.glob<UiIcons>('../data/ui-icons.json', {eager: true, import: 'default'});
const uiIcons: UiIcons = Object.values(manifests)[0] ?? {types: {}, categories: {}, items: {}};

export function typeIconPath(type: string): string | null {
  return uiIcons.types[type.toLowerCase()] ?? null;
}

export function categoryIconPath(category: 'Physical' | 'Special' | 'Status'): string | null {
  return uiIcons.categories[category] ?? null;
}

export function itemIconPath(itemDexId: string): string | null {
  return uiIcons.items[itemDexId] ?? null;
}
