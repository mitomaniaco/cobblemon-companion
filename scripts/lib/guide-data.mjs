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

/** heldItem da fonte é uma lista de alternativas (o RCT sorteia/escolhe uma): vira lista de ids, nunca um item escolhido. */
function heldItemAlternatives(heldItem) {
  const list = (Array.isArray(heldItem) ? heldItem : [heldItem]).filter(Boolean).map(withNamespace);
  return list.length > 0 ? list : null;
}

export function deriveTrainer(json, {id, jar, sha256, file, mob}) {
  if (!Array.isArray(json.team) || json.team.length === 0) throw new Error(`treinador sem time: ${file}`);
  return {
    id,
    name: json.name,
    format: json.battleFormat === undefined ? 'singles' : (FORMATS[json.battleFormat] ?? 'unknown'), // TrainerTeam.battleFormat inicia em GEN_9_SINGLES
    ai: json.ai ?? null,
    battleRules: {maxItemUses: json.battleRules?.maxItemUses ?? null},
    bag: (json.bag ?? []).map((entry) => ({item: withNamespace(entry.item), quantity: entry.quantity ?? 1})),
    mob: mob
      ? {
          type: mob.type ?? null,
          signatureItem: mob.signatureItem ? withNamespace(mob.signatureItem) : null,
          optional: mob.optional === true,
          biomes: Array.isArray(mob.biomeTagWhitelist) ? [...mob.biomeTagWhitelist] : [],
          excludedBiomes: Array.isArray(mob.biomeTagBlacklist) ? [...mob.biomeTagBlacklist] : [],
        }
      : null,
    team: json.team.map((pokemon) => {
      return {
        speciesId: withNamespace(pokemon.species),
        level: pokemon.level,
        moves: (pokemon.moveset ?? []).map(withNamespace),
        ability: pokemon.ability ?? null,
        nature: pokemon.nature ?? null,
        heldItem: heldItemAlternatives(pokemon.heldItem),
        ivs: pokemon.ivs ?? null,
        evs: pokemon.evs ?? null,
        aspects: pokemon.aspects ?? [],
      };
    }),
    source: {jar, sha256, file},
  };
}

/**
 * Séries do RCT. Cada série tem metadados (data/<ns>/series/<id>.json) e membros: treinadores com arquivo em
 * mobs/trainers/<dir>/<id>.json cujo `series` a lista, mais (inferido) treinadores sem arquivo próprio cujo id começa com
 * `<grupo>_` de um mobs/trainers/groups/<grupo>.json que a lista (vence o prefixo mais longo).
 * `requires` é uma lista de grupos "qualquer um de" (requiredDefeats): o treinador libera quando todos os grupos têm uma vitória.
 */
export function deriveSeries({namespace, seriesMeta, mobs, groups, trainerIds}) {
  const own = new Set(Object.keys(mobs));
  const groupNames = Object.keys(groups).sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  const nodeFor = (json, via) => ({
    type: json.type ?? null,
    optional: json.optional === true,
    requires: (json.requiredDefeats ?? [])
      .filter((group) => group.length > 0)
      .map(
        // grupo vazio (`[[]]` nas séries do KubeJS) não exige nada
        (group) => group.map((id) => `${namespace}:${id}`),
      ),
    via,
  });
  const result = {};
  for (const seriesId of Object.keys(seriesMeta).sort()) {
    const meta = seriesMeta[seriesId];
    const graph = {};
    for (const [id, json] of Object.entries(mobs)) if (json.series?.includes(seriesId)) graph[`${namespace}:${id}`] = nodeFor(json, 'mob');
    for (const id of trainerIds) {
      if (own.has(id)) continue;
      const group = groupNames.find((name) => id.startsWith(`${name}_`));
      if (group && groups[group].series?.includes(seriesId)) graph[`${namespace}:${id}`] = nodeFor(groups[group], `group:${group}`);
    }
    result[seriesId] = {
      difficulty: meta.difficulty ?? null,
      requiredSeries: meta.requiredSeries ?? [],
      initialLevelCap: meta.initialLevelCap ?? null,
      relativeLevelCap: meta.relativeLevelCap ?? null,
      trainerIds: Object.keys(graph).sort(),
      order: topologicalOrder(graph, seriesId),
      graph: Object.fromEntries(Object.entries(graph).sort(([a], [b]) => (a < b ? -1 : 1))),
    };
  }
  return result;
}

function topologicalOrder(graph, seriesId) {
  const placed = new Set();
  const order = [];
  const pending = new Set(Object.keys(graph));
  while (pending.size > 0) {
    const ready = [...pending]
      .filter((id) =>
        graph[id].requires.every((group) =>
          group.some((dependency) => placed.has(dependency) || (!pending.has(dependency) && !(dependency in graph))),
        ),
      )
      .sort();
    if (ready.length === 0) throw new Error(`dependência cíclica na série ${seriesId}`);
    for (const id of ready) {
      placed.add(id);
      pending.delete(id);
      order.push(id);
    }
  }
  return order;
}

/**
 * Campanha por série: uma etapa por treinador "lógico". Os membros de um mesmo grupo de `requiredDefeats` são irmãos no RCT
 * (vencer um conta como vencer todos), então formam uma única etapa com várias variantes. Qual variante aparece é um sorteio
 * ponderado no spawn (TrainerSpawner.computeWeight), sem regra por escolha inicial/dificuldade: variantes ficam `ambiguous`.
 * Etapas só opcionais saem de `stages` e ficam em `optionalTrainerIds`.
 */
export function deriveCampaign({series, trainers, levelCapConfig}) {
  const byId = new Map(trainers.map((trainer) => [trainer.id, trainer]));
  const result = {};
  for (const [seriesId, entry] of Object.entries(series)) {
    const position = new Map(entry.order.map((id, index) => [id, index]));
    const parent = new Map(entry.trainerIds.map((id) => [id, id]));
    const find = (id) => {
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root);
      parent.set(id, root);
      return root;
    };
    for (const id of entry.trainerIds) {
      for (const group of entry.graph[id].requires) {
        const members = group.filter((member) => parent.has(member));
        for (const member of members.slice(1)) parent.set(find(member), find(members[0]));
      }
    }
    const classes = new Map();
    for (const id of [...entry.trainerIds].sort((a, b) => position.get(a) - position.get(b))) {
      const root = find(id);
      if (!classes.has(root)) classes.set(root, []);
      classes.get(root).push(id);
    }
    const stageOf = new Map();
    const draft = [];
    for (const members of classes.values()) {
      const stageId = `${seriesId}:${members[0].split(':')[1]}`;
      for (const member of members) stageOf.set(member, stageId);
      draft.push({stageId, members});
    }
    const optionalTrainerIds = [];
    const main = [];
    for (const stage of draft) {
      const nodes = stage.members.map((id) => entry.graph[id]);
      if (nodes.every((node) => node.optional)) optionalTrainerIds.push(...stage.members);
      else main.push(stage);
    }
    const mainIds = new Set(main.map((stage) => stage.stageId));
    const requiresOf = (stage) =>
      [
        ...new Set(
          stage.members.flatMap((id) => entry.graph[id].requires.map((group) => stageOf.get(group.find((member) => stageOf.has(member))))),
        ),
      ].filter((stageId) => stageId && stageId !== stage.stageId && mainIds.has(stageId));
    const stages = main.map((stage) => ({stage, requires: requiresOf(stage).sort()}));
    const placed = new Set();
    const ordered = [];
    while (ordered.length < stages.length) {
      const next = stages.find((item) => !placed.has(item.stage.stageId) && item.requires.every((required) => placed.has(required)));
      if (!next) throw new Error(`dependência cíclica entre etapas da série ${seriesId}`);
      placed.add(next.stage.stageId);
      ordered.push(next);
    }
    const seen = new Map();
    const totals = new Map();
    for (const {stage} of ordered) {
      const name = byId.get(stage.members[0])?.name ?? stage.members[0];
      totals.set(name, (totals.get(name) ?? 0) + 1);
    }
    const caps = computeStageCaps({entry, ordered, byId, config: levelCapConfig});
    result[seriesId] = {
      levelCapRule: caps.rule,
      stages: ordered.map(({stage, requires}, index) => {
        const first = byId.get(stage.members[0]);
        const baseName = first?.name ?? stage.members[0];
        const n = (seen.get(baseName) ?? 0) + 1;
        seen.set(baseName, n);
        const variants = stage.members.map((id) => {
          const trainer = byId.get(id);
          return {
            id,
            format: trainer?.format ?? 'unknown',
            maxLevel: Math.max(...(trainer?.team ?? []).map((pokemon) => pokemon.level)),
            teamSize: trainer?.team.length ?? 0,
            optional: entry.graph[id].optional,
          };
        });
        const ambiguous = variants.length > 1;
        return {
          stageId: stage.stageId,
          name: totals.get(baseName) > 1 ? `${baseName} · ${n}º encontro` : baseName,
          type: entry.graph[stage.members[0]].type,
          order: index,
          requires,
          capBefore: caps.byStage.get(stage.stageId).capBefore,
          capAfter: caps.byStage.get(stage.stageId).capAfter,
          capUnknownReason: caps.byStage.get(stage.stageId).unknownReason,
          ambiguous,
          ambiguousReason: ambiguous
            ? 'O RCT sorteia uma destas equipes quando o treinador aparece; vencer qualquer uma conta para a etapa.'
            : null,
          variants,
        };
      }),
      optionalTrainerIds: optionalTrainerIds.sort(),
    };
  }
  return result;
}

/**
 * Mapeamento espécie -> fonte de arte. O app só consegue arte 2D do PokeAPI/HOME por número da dex nacional: os JARs do
 * modpack trazem apenas texturas de modelo 3D (atlas UV em assets/cobblemon/textures/pokemon/<dex>_<slug>/), que não servem como retrato.
 * A chave é o slug do Cobblemon (nome-independente); `forms` lista as formas declaradas pela espécie e as observadas nos times dos adversários (`declared: false`), por conjunto de aspectos.
 */
export function deriveArtworkSources(species, slugs, trainers = []) {
  const key = (aspects) => [...aspects].sort().join('+');
  const observed = new Map();
  for (const trainer of trainers) {
    for (const pokemon of trainer.team) {
      if (pokemon.aspects.length === 0) continue;
      const slug = pokemon.speciesId.split(':').pop();
      if (!observed.has(slug)) observed.set(slug, new Map());
      observed.get(slug).set(key(pokemon.aspects), [...pokemon.aspects].sort());
    }
  }
  const result = {};
  for (const slug of slugs) {
    const json = species[slug];
    const forms = new Map();
    for (const form of json.forms ?? []) {
      if ((form.aspects ?? []).length > 0)
        forms.set(key(form.aspects), {name: form.name, aspects: [...form.aspects].sort(), declared: true});
    }
    for (const [formKey, aspects] of observed.get(slug) ?? [])
      if (!forms.has(formKey)) forms.set(formKey, {name: null, aspects, declared: false});
    result[slug] = {
      nationalDex: Number.isInteger(json.nationalPokedexNumber) ? json.nationalPokedexNumber : null,
      source: 'pokeapi-home-dex',
      forms: [...forms.values()].sort((x, y) => (key(x.aspects) < key(y.aspects) ? -1 : 1)),
    };
  }
  return result;
}

const MAX_LEVEL = 100;

/**
 * Level cap por etapa pela regra do mod (LevelUtils.levelCap / trainerLevel, bytecode do rctmod 0.18.1-beta):
 *   trainerLevel(T) = max( min(100, max(0, nívelMáximoDoTime(T) + relativeLevelCap)), max_{R em requiredDefeats(T)} trainerLevel(R) )
 *   levelCap(vencidos) = max( initialLevelCap, min_{N em próximos(vencidos)} trainerLevel(N) ), 100 se não há próximo.
 * "Próximo" = nó não opcional, não vencido, com cada grupo de requiredDefeats satisfeito por algum membro vencido.
 * Opcional = opcional, ou com irmão/pré-requisito opcional (TrainerNode.isOptional). capBefore: só os pré-requisitos
 * transitivos da etapa vencidos; capAfter: esses mais a própria etapa (vencida em qualquer variante). Etapas paralelas
 * não vencidas entram na fronteira, então o cap é o da menor entre elas.
 */
function computeStageCaps({entry, ordered, byId, config}) {
  const graph = entry.graph;
  const initial = entry.initialLevelCap ?? config.initialLevelCap;
  const relative = entry.relativeLevelCap ?? config.relativeLevelCap;
  const rule = {
    initialLevelCap: initial,
    initialLevelCapSource: entry.initialLevelCap === null ? 'config/rctmod-server.toml' : 'série',
    relativeLevelCap: relative,
    relativeLevelCapSource: entry.relativeLevelCap === null ? 'config/rctmod-server.toml' : 'série',
  };
  const siblingsOf = new Map();
  for (const node of Object.values(graph)) {
    for (const group of node.requires) {
      for (const member of group) siblingsOf.set(member, [...(siblingsOf.get(member) ?? []), ...group]);
    }
  }
  const lacking = new Set(Object.keys(graph).filter((id) => (byId.get(id)?.team ?? []).length === 0));
  const memo = new Map();
  const trainerLevel = (id, trail = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (trail.has(id)) return 0;
    trail.add(id);
    const team = byId.get(id)?.team ?? [];
    const own = Math.min(MAX_LEVEL, Math.max(0, Math.max(0, ...team.map((pokemon) => pokemon.level)) + relative));
    const required = (graph[id]?.requires ?? []).flat().filter((requiredId) => requiredId in graph);
    const level = Math.max(own, ...required.map((requiredId) => trainerLevel(requiredId, trail)));
    trail.delete(id);
    memo.set(id, level);
    return level;
  };
  const optionalMemo = new Map();
  const isOptional = (id, trail = new Set()) => {
    if (optionalMemo.has(id)) return optionalMemo.get(id);
    if (trail.has(id)) return false;
    trail.add(id);
    const node = graph[id];
    const siblings = (siblingsOf.get(id) ?? []).filter((sibling) => sibling !== id);
    const value =
      node.optional ||
      siblings.some((sibling) => isOptional(sibling, trail)) ||
      node.requires.flat().some((requiredId) => requiredId in graph && isOptional(requiredId, trail));
    trail.delete(id);
    optionalMemo.set(id, value);
    return value;
  };
  const lackingMemo = new Map();
  const dependsOnLacking = (id, trail = new Set()) => {
    if (lackingMemo.has(id)) return lackingMemo.get(id);
    if (trail.has(id)) return false;
    trail.add(id);
    const value =
      lacking.has(id) ||
      (graph[id]?.requires ?? []).flat().some((requiredId) => requiredId in graph && dependsOnLacking(requiredId, trail));
    trail.delete(id);
    lackingMemo.set(id, value);
    return value;
  };
  const stageMembers = new Map(ordered.map(({stage}) => [stage.stageId, stage.members]));
  const cap = (defeatedStages) => {
    const defeated = new Set(defeatedStages.flatMap((stageId) => stageMembers.get(stageId)));
    const frontier = Object.keys(graph).filter(
      (id) => !defeated.has(id) && !isOptional(id) && graph[id].requires.every((group) => group.some((member) => defeated.has(member))),
    );
    const levels = frontier.map((id) => trainerLevel(id));
    const value = frontier.length === 0 ? MAX_LEVEL : Math.max(initial, Math.min(...levels));
    const unknown = frontier.some((id) => dependsOnLacking(id));
    return {value, missing: unknown};
  };
  const stageIds = ordered.map(({stage}) => stage.stageId);
  const requiresOf = new Map(ordered.map(({stage, requires}) => [stage.stageId, requires]));
  const ancestors = (stageId, seen = new Set()) => {
    for (const required of requiresOf.get(stageId) ?? []) {
      if (!seen.has(required)) {
        seen.add(required);
        ancestors(required, seen);
      }
    }
    return seen;
  };
  const byStage = new Map();
  for (const stageId of stageIds) {
    const before = [...ancestors(stageId)];
    const capBefore = cap(before);
    const capAfter = cap([...before, stageId]);
    const unknown = capBefore.missing || capAfter.missing;
    byStage.set(stageId, {
      capBefore: unknown ? null : capBefore.value,
      capAfter: unknown ? null : capAfter.value,
      unknownReason: unknown ? 'time de algum treinador da fronteira ou de seus pré-requisitos ausente em trainers.json' : null,
    });
  }
  return {rule, byStage};
}

/**
 * Conquistas de derrota de treinador (`<ns>:trainers/<nome>`) do RCT: cada uma vale por derrotar qualquer um dos treinadores
 * listados, uma vez. O save do jogador marca `done` nelas mesmo quando o contador de progresso (`progressDefeats`) está zerado.
 * Só entram as de gatilho `rctmod:defeat_count` com ids de treinador e `count` 1. `files`: `[{namespace, name, json}]`.
 */
export function deriveAdvancements(files) {
  const output = {};
  for (const {namespace, name, json} of [...files].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const criteria = Object.values(json.criteria ?? {});
    if (criteria.length !== 1) continue;
    const [{trigger, conditions}] = criteria;
    const ids = conditions?.trainer_ids;
    if (trigger !== 'rctmod:defeat_count' || conditions?.count !== 1 || !Array.isArray(ids) || ids.length === 0) continue;
    output[`${namespace}:trainers/${name}`] = ids.map((id) => (String(id).includes(':') ? String(id) : `${namespace}:${id}`)).sort();
  }
  return output;
}
