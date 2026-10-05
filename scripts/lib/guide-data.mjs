// Regras puras do gerador de dados do guia (sem I/O). Entradas são os JSON de espécie/treinador do jogo.

const withNamespace = (id) => (id.includes(':') ? id : `cobblemon:${id}`);
const unique = (values) => [...new Set(values)];

/** Aplica, na ordem dos provedores, arquivos de espécie (substituem) e species_additions (acrescentam golpes e evoluções). */
export function mergeSpecies(baseSpecies, providers) {
  const merged = structuredClone(baseSpecies);
  for (const provider of providers) {
    for (const [slug, json] of Object.entries(provider.species)) {
      if (Object.hasOwn(merged, slug)) merged[slug] = structuredClone(json);
    }
    for (const {target, json} of provider.additions) {
      const species = merged[target];
      if (!species) continue;
      if (Array.isArray(json.moves)) species.moves = unique([...(species.moves ?? []), ...json.moves]);
      if (Array.isArray(json.evolutions)) {
        const known = new Set((species.evolutions ?? []).map((evolution) => evolution.id));
        species.evolutions = [...(species.evolutions ?? []), ...json.evolutions.filter((evolution) => !known.has(evolution.id))];
      }
    }
  }
  return merged;
}

export function deriveLearnset(moves) {
  const result = {levelUp: [], tm: [], tutor: [], egg: []};
  for (const entry of moves ?? []) {
    const separator = entry.indexOf(':');
    const prefix = entry.slice(0, separator);
    const moveId = `cobblemon:${entry.slice(separator + 1)}`;
    if (/^\d+$/.test(prefix))
      result.levelUp.push({level: Math.max(1, Number(prefix)), moveId}); // a fonte tem um "0:" isolado (vaporeon); vira nível 1;
    else if (prefix === 'tm') result.tm.push(moveId);
    else if (prefix === 'egg') result.egg.push(moveId);
    else if (prefix === 'form_change')
      continue; // golpe trocado por mudança de forma, não aprendido
    else if (prefix === 'tutor' || prefix === 'legacy' || prefix === 'special') result.tutor.push(moveId);
    else throw new Error(`prefixo de golpe desconhecido: ${entry}`);
  }
  result.tm = unique(result.tm);
  result.tutor = unique(result.tutor);
  result.egg = unique(result.egg);
  return result;
}

const describe = (object) =>
  Object.entries(object)
    .filter(([key]) => key !== 'variant')
    .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join(',');

export function deriveEvolutions(evolutions) {
  return (evolutions ?? []).map((evolution) => {
    const parts = [];
    if (evolution.requiredContext) parts.push(`requiredContext=${evolution.requiredContext}`);
    for (const requirement of evolution.requirements ?? []) parts.push(`${requirement.variant}(${describe(requirement)})`);
    return {to: withNamespace(evolution.result.split(' ')[0]), method: evolution.variant, requirement: parts.join('; ')};
  });
}

const FORMATS = {GEN_9_SINGLES: 'singles', GEN_9_DOUBLES: 'doubles'};

export function deriveTrainer(json, {id, jar, sha256, file}) {
  if (!Array.isArray(json.team) || json.team.length === 0) throw new Error(`treinador sem time: ${file}`);
  return {
    id,
    name: json.name,
    format: FORMATS[json.battleFormat] ?? 'unknown',
    team: json.team.map((pokemon) => {
      const item = Array.isArray(pokemon.heldItem) ? pokemon.heldItem[0] : pokemon.heldItem;
      return {
        speciesId: withNamespace(pokemon.species),
        level: pokemon.level,
        moves: (pokemon.moveset ?? []).map(withNamespace),
        ability: pokemon.ability ?? null,
        nature: pokemon.nature ?? null,
        heldItem: item ? withNamespace(item) : null,
        ivs: pokemon.ivs ?? null,
        evs: pokemon.evs ?? null,
        aspects: pokemon.aspects ?? [],
      };
    }),
    source: {jar, sha256, file},
  };
}
