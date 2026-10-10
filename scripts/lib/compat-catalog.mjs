// Funções puras do gerador do catálogo de compatibilidade (sem acesso a disco ou rede).
// O CLI em scripts/generate-compat-catalog.mjs lê os arquivos do jogo e usa estas funções;
// os testes cobrem as regras com dados sintéticos.
import {parse} from 'acorn';

const STAT_KEYS = Object.freeze({
  hp: 'hp',
  attack: 'atk',
  defence: 'def',
  special_attack: 'spa',
  special_defence: 'spd',
  speed: 'spe',
});

const BATTLE_SPECIES_KEYS = Object.freeze(['primaryType', 'secondaryType', 'baseStats', 'weight', 'abilities']);

/** Slug do arquivo: o Cobblemon identifica a espécie pelo nome do arquivo, sem as subpastas. */
export function speciesSlug(path) {
  return path
    .split('/')
    .pop()
    .replace(/\.json$/, '');
}

function titleCase(type) {
  return type ? type[0].toUpperCase() + type.slice(1) : null;
}

function abilityIds(list) {
  const abilities = [];
  for (const entry of Array.isArray(list) ? list : []) {
    const id = String(entry).replace(/^h:/, '');
    if (id && !abilities.includes(id)) abilities.push(id);
  }
  return abilities;
}

function mapBaseStats(source) {
  const baseStats = {};
  for (const [key, target] of Object.entries(STAT_KEYS)) baseStats[target] = source?.[key] ?? null;
  return baseStats;
}

/**
 * Fatos de uma forma alternativa (`forms[]` do JSON da espécie). A forma herda o que não declara; o tipo secundário
 * só é herdado se a forma também não redefine o primário (Farfetch'd-Galar vira só Lutador).
 */
function formFacts(json, form) {
  const primary = form.primaryType ?? json.primaryType;
  let secondary = json.secondaryType;
  if (Object.hasOwn(form, 'secondaryType')) secondary = form.secondaryType;
  else if (form.primaryType !== undefined) secondary = null;
  return {
    name: `${json.name}-${form.name}`,
    key: String(form.name)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ''),
    aspects: Array.isArray(form.aspects) ? [...form.aspects].sort() : [],
    types: [titleCase(primary), titleCase(secondary)].filter(Boolean),
    baseStats: mapBaseStats(form.baseStats ?? json.baseStats),
    weightHg: typeof (form.weight ?? json.weight) === 'number' ? (form.weight ?? json.weight) : null,
    abilities: abilityIds(form.abilities ?? json.abilities),
  };
}

/** Extrai só os fatos que afetam o cálculo de dano (forma normal e formas alternativas fora de batalha). */
export function speciesFacts(json) {
  const forms = (Array.isArray(json.forms) ? json.forms : [])
    .filter((form) => typeof form?.name === 'string' && form.name.length > 0 && form.battleOnly !== true)
    .map((form) => formFacts(json, form));
  return {
    name: typeof json.name === 'string' ? json.name : null,
    implemented: json.implemented === true,
    types: [titleCase(json.primaryType), titleCase(json.secondaryType)].filter(Boolean),
    baseStats: mapBaseStats(json.baseStats),
    weightHg: typeof json.weight === 'number' ? json.weight : null,
    abilities: abilityIds(json.abilities),
    forms,
  };
}

/**
 * Compara os fatos do Cobblemon com a espécie de mesmo nome na geração 9 do @smogon/calc.
 * `calcSpecies` é o objeto retornado por `generation.species.get(id)` ou undefined.
 */
export function compareWithCalc(facts, calcSpecies) {
  if (!facts.name) return {matches: false, reasons: ['sem nome']};
  if (!calcSpecies) return {matches: false, reasons: ['espécie ausente no calc']};
  const reasons = [];
  if (JSON.stringify(facts.types) !== JSON.stringify(calcSpecies.types)) reasons.push(`tipos ${facts.types} ≠ ${calcSpecies.types}`);
  for (const [stat, value] of Object.entries(facts.baseStats)) {
    if (value !== calcSpecies.baseStats[stat]) reasons.push(`${stat} ${value} ≠ ${calcSpecies.baseStats[stat]}`);
  }
  if (facts.weightHg === null || Math.abs(facts.weightHg / 10 - calcSpecies.weightkg) > 0.05) {
    reasons.push(`peso ${facts.weightHg === null ? 'ausente' : facts.weightHg / 10} ≠ ${calcSpecies.weightkg}`);
  }
  return {matches: reasons.length === 0, reasons};
}

/**
 * Compara um arquivo de espécie de outro provedor com o arquivo-base do Cobblemon.
 * Devolve os campos de batalha que divergem (lista vazia = o provedor não altera o cálculo).
 */
export function battleDifferences(baseJson, otherJson) {
  const base = speciesFacts(baseJson);
  const other = speciesFacts(otherJson);
  const differences = [];
  if (JSON.stringify(base.types) !== JSON.stringify(other.types)) differences.push('types');
  if (JSON.stringify(base.baseStats) !== JSON.stringify(other.baseStats)) differences.push('baseStats');
  if (base.weightHg !== other.weightHg) differences.push('weight');
  if (JSON.stringify(base.abilities) !== JSON.stringify(other.abilities)) differences.push('abilities');
  return differences;
}

/** Campos de batalha que uma adição (`species_additions`) tentou alterar. */
export function additionBattleKeys(additionJson) {
  return BATTLE_SPECIES_KEYS.filter((key) => Object.hasOwn(additionJson, key));
}

/**
 * Regra do catálogo de espécies. Uma espécie entra somente se:
 * implementada, dados de forma normal idênticos aos do calc, nenhum provedor altera seus dados de
 * batalha e ao menos uma habilidade da espécie está no conjunto de habilidades compatíveis.
 * `species` é o mapa slug → {facts, calcMatches, conflicts}.
 */
export function speciesStatus(entry, supportedAbilityIds) {
  if (!entry.facts.implemented) return {status: 'excluded', reason: 'not-implemented'};
  if (!entry.calcMatches) return {status: 'excluded', reason: 'calc-mismatch'};
  if (entry.conflicts.length > 0) return {status: 'excluded', reason: 'pack-override'};
  const abilities = entry.facts.abilities.map((id) => `cobblemon:${id}`).filter((id) => supportedAbilityIds.has(id));
  if (abilities.length === 0) return {status: 'excluded', reason: 'no-supported-ability'};
  return {status: 'included', abilities};
}

/** Constrói o mapa `species` do catálogo, ordenado pelo ID. */
export function deriveSpeciesCatalog(manifestSpecies, supportedAbilityIds) {
  const output = {};
  for (const slug of Object.keys(manifestSpecies).sort()) {
    const entry = manifestSpecies[slug];
    const verdict = speciesStatus(entry, supportedAbilityIds);
    if (verdict.status !== 'included') continue;
    const forms = {};
    for (const form of entry.facts.forms) {
      const formVerdict = formStatus(form, supportedAbilityIds);
      if (formVerdict.status === 'included') forms[form.key] = {name: form.name, aspects: form.aspects, abilities: formVerdict.abilities};
    }
    output[`cobblemon:${slug}`] = {name: entry.facts.name, abilities: verdict.abilities, forms};
  }
  return output;
}

/** Regra das formas de uma espécie incluída: dados idênticos aos do calc e ao menos uma habilidade compatível. */
export function formStatus(form, supportedAbilityIds) {
  if (!form.calcMatches) return {status: 'excluded', reason: 'form-calc-mismatch'};
  const abilities = form.abilities.map((id) => `cobblemon:${id}`).filter((id) => supportedAbilityIds.has(id));
  if (abilities.length === 0) return {status: 'excluded', reason: 'form-no-supported-ability'};
  return {status: 'included', abilities};
}

const IGNORED_AST_KEYS = new Set(['start', 'end', 'loc', 'range', 'raw']);

function astFingerprint(node) {
  return JSON.stringify(node, (key, value) => (IGNORED_AST_KEYS.has(key) ? undefined : value));
}

function propertyName(property) {
  if (property.computed) return null;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal') return String(property.key.value);
  return null;
}

/** Propriedades do objeto literal `var|const|let <exportName> = {...}` de um arquivo do Showdown compilado. */
function exportedObjectProperties(source, exportName) {
  const ast = parse(source.replace(/\r\n/g, '\n'), {ecmaVersion: 'latest', sourceType: 'script'});
  for (const statement of ast.body) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const declaration of statement.declarations) {
      if (declaration.id.type !== 'Identifier' || declaration.id.name !== exportName) continue;
      if (declaration.init?.type !== 'ObjectExpression') continue;
      return declaration.init.properties;
    }
  }
  throw new Error(`Objeto ${exportName} não encontrado no arquivo do Showdown`);
}

/**
 * Lê um arquivo de dados do Showdown já compilado (esbuild) e devolve, para cada entrada do objeto
 * principal (`Moves`, `Abilities`...), uma impressão digital da AST. Parênteses redundantes,
 * espaços, vírgulas finais e aspas não alteram a impressão; qualquer mudança de lógica altera.
 * O código nunca é executado.
 */
export function showdownEntryFingerprints(source, exportName) {
  const entries = {};
  for (const property of exportedObjectProperties(source, exportName)) {
    if (property.type !== 'Property') continue;
    const name = propertyName(property);
    if (name !== null) entries[name.toLowerCase()] = astFingerprint(property.value);
  }
  return entries;
}

/** Nome (`name`) literal de cada entrada do objeto principal; `null` quando ausente ou não literal. */
export function showdownEntryNames(source, exportName) {
  const names = {};
  for (const property of exportedObjectProperties(source, exportName)) {
    if (property.type !== 'Property' || property.value.type !== 'ObjectExpression') continue;
    const name = propertyName(property);
    if (name === null) continue;
    const nameProperty = property.value.properties.find((item) => item.type === 'Property' && propertyName(item) === 'name');
    const literal = nameProperty?.value;
    names[name.toLowerCase()] = literal?.type === 'Literal' && typeof literal.value === 'string' ? literal.value : null;
  }
  return names;
}

/**
 * Impressão da AST de cada método de classe (`getDamage() {...}`) do arquivo. Percorre a árvore sem executar o código.
 */
export function classMethodFingerprints(source) {
  const ast = parse(source.replace(/\r\n/g, '\n'), {ecmaVersion: 'latest', sourceType: 'script'});
  const methods = {};
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    if (node.type === 'MethodDefinition' && node.key.type === 'Identifier' && !node.computed) {
      methods[node.key.name] = astFingerprint(node.value);
    }
    for (const value of Object.values(node)) visit(value);
  };
  visit(ast);
  return methods;
}

function scalarValue(node) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal') return -node.argument.value;
  return null;
}

const MOVE_FACT_KEYS = ['name', 'category', 'target', 'basePower', 'critRatio', 'isNonstandard'];
const MOVE_FLAG_KEYS = ['isZ', 'isMax'];
const MOVE_PRESENCE_KEYS = ['multihit', 'damage', 'ohko', 'selfdestruct', 'willCrit', 'multiaccuracy'];

/**
 * Lê `var Moves = {...}` do Showdown já compilado e devolve os fatos estruturais de cada golpe
 * (categoria, alvo, mecânicas especiais e callbacks). Chaves ausentes ficam `null`. O código nunca é executado.
 */
export function showdownMoveFacts(source, {extraKeys = []} = {}) {
  const ast = parse(source.replace(/\r\n/g, '\n'), {ecmaVersion: 'latest', sourceType: 'script'});
  for (const statement of ast.body) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const declaration of statement.declarations) {
      if (declaration.id.type !== 'Identifier' || declaration.id.name !== 'Moves') continue;
      if (declaration.init?.type !== 'ObjectExpression') continue;
      const moves = {};
      for (const property of declaration.init.properties) {
        if (property.type !== 'Property' || property.value.type !== 'ObjectExpression') continue;
        const id = propertyName(property);
        if (id === null) continue;
        const facts = {};
        for (const key of [...MOVE_FACT_KEYS, ...extraKeys, ...MOVE_FLAG_KEYS, ...MOVE_PRESENCE_KEYS]) facts[key] = null;
        for (const key of [...MOVE_FLAG_KEYS, ...MOVE_PRESENCE_KEYS]) facts[key] = false;
        facts.callbacks = [];
        for (const inner of property.value.properties) {
          if (inner.type !== 'Property') continue;
          const name = propertyName(inner);
          if (name === null) continue;
          if (inner.method || inner.value.type === 'FunctionExpression' || inner.value.type === 'ArrowFunctionExpression') {
            facts.callbacks.push(name);
          } else if (MOVE_FACT_KEYS.includes(name) || extraKeys.includes(name)) {
            facts[name] = scalarValue(inner.value);
          } else if (MOVE_FLAG_KEYS.includes(name)) {
            // `isZ` e `isMax` trazem o nome do cristal/espécie (string) ou `true`: qualquer valor diferente de false marca o golpe.
            const flag = scalarValue(inner.value);
            facts[name] = flag !== null && flag !== false;
          } else if (MOVE_PRESENCE_KEYS.includes(name)) {
            facts[name] = true;
          }
        }
        moves[id.toLowerCase()] = facts;
      }
      return moves;
    }
  }
  throw new Error('Objeto Moves não encontrado no arquivo do Showdown');
}

const DERIVABLE_TARGETS = new Set(['normal', 'any', 'allAdjacent', 'allAdjacentFoes', 'adjacentFoe', 'randomNormal']);
const EXCLUDED_NONSTANDARD = new Set(['LGPE', 'Gigantamax']);

/** Callbacks que decidem se o golpe pode ser usado (e não quanto ele causa). */
const USAGE_CALLBACKS = Object.freeze([
  'onTry',
  'onTryMove',
  'onDisableMove',
  'beforeMoveCallback',
  'priorityChargeCallback',
  'onTryImmunity',
  'onModifyPriority',
  'onModifyTarget',
]);
/** Golpes de uso condicionado que o modelo aceita: o alvo sempre ataca; Fake Out/First Impression só no primeiro turno. */
export const USAGE_ALLOWLIST = Object.freeze({
  suckerpunch: 'targetAttacks',
  thunderclap: 'targetAttacks',
  fakeout: 'firstTurnOnly',
  firstimpression: 'firstTurnOnly',
});
/** Golpes que só funcionam sob condição do alvo (prioridade) que o modelo não representa, mesmo sem callback de uso. */
const USAGE_DENYLIST = Object.freeze(['upperhand']);
/** Callbacks sem efeito no dano que o app calcula (efeitos secundários, mensagens, preparação). */
const HARMLESS_CALLBACKS = Object.freeze([
  'onHit',
  'onAfterHit',
  'onAfterMove',
  'onAfterMoveSecondarySelf',
  'onAfterSubDamage',
  'onUseMoveMessage',
  'onMoveFail',
  'onPrepareHit',
  'onTryHit',
  'beforeTurnCallback',
]);

/**
 * Decide se um golpe entra no catálogo. Golpes da lista-base revisada ficam sempre; os demais só entram se o
 * dano depender só de mecânicas que o @smogon/calc modela, e se o calc e os outros pacotes concordarem.
 * `calcNamesMove`: o código do calc cita o golpe pelo nome (callbacks de dano só valem então).
 * `calcDamageProbe`: maior dos 16 rolls de Mew contra Mew; 0 = o calc não modela o dano do golpe.
 * `critRatio` não exclui: o app não pede crítico ao calc.
 */
export function moveStatus(facts, {isBase, calcHasMove, packDiffers, calcNamesMove = false, calcDamageProbe = null}) {
  if (isBase) return {status: 'base'};
  const exclude = (reason) => ({status: 'excluded', reason});
  if (facts.category !== 'Physical' && facts.category !== 'Special') return exclude('not-damaging');
  if (facts.isZ || facts.isMax || EXCLUDED_NONSTANDARD.has(facts.isNonstandard)) return exclude('nonstandard');
  if (!DERIVABLE_TARGETS.has(facts.target)) return exclude('target');
  if (facts.ohko || facts.multiaccuracy) return exclude('mechanics');
  const id = String(facts.name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const usageCallback = facts.callbacks.some((name) => USAGE_CALLBACKS.includes(name));
  if ((usageCallback && !Object.hasOwn(USAGE_ALLOWLIST, id)) || USAGE_DENYLIST.includes(id)) return exclude('usage');
  const damageCallback = facts.callbacks.some((name) => !USAGE_CALLBACKS.includes(name) && !HARMLESS_CALLBACKS.includes(name));
  if (damageCallback && !calcNamesMove) return exclude('callbacks');
  if (!calcHasMove) return exclude('calc-missing');
  if (calcDamageProbe === 0) return exclude('calc-zero');
  if (packDiffers) return exclude('pack-override');
  return {status: 'derived'};
}

/** Mapa `moves` do catálogo (chave com namespace e alias sem), ordenado pelo id. */
export function deriveMovesCatalog(manifestMoves) {
  const output = {};
  for (const id of Object.keys(manifestMoves).sort()) {
    const entry = manifestMoves[id];
    if (entry.status !== 'base' && entry.status !== 'derived') continue;
    const record = {name: entry.name};
    if (USAGE_ALLOWLIST[id] === 'firstTurnOnly') record.firstTurnOnly = true;
    if (entry.selfdestruct === true) record.selfDestruct = true;
    output[`cobblemon:${id}`] = record;
    output[id] = {...record};
  }
  return output;
}

/**
 * Regra do catálogo de itens segurados. Um item entra somente se tem nome literal, o @smogon/calc o conhece
 * e nenhum outro pacote (Showdown ou held_items do Mega Showdown) o redefine.
 */
export function itemStatus({name, calcHasItem, packDiffers}) {
  const exclude = (reason) => ({status: 'excluded', reason});
  if (name === null) return exclude('no-name');
  if (!calcHasItem) return exclude('calc-missing');
  if (packDiffers) return exclude('pack-override');
  return {status: 'derived'};
}

/** Mapa `items` do catálogo (chave = id do Showdown, sem namespace), ordenado pelo id. */
export function deriveItemsCatalog(manifestItems) {
  const output = {};
  for (const id of Object.keys(manifestItems).sort()) {
    if (manifestItems[id].status === 'derived') output[id] = {name: manifestItems[id].name};
  }
  return output;
}

/** Classifica ids do catálogo comparando as impressões do provedor-base com as de outro provedor. */
export function compareShowdownEntries(baseEntries, otherEntries, ids) {
  const identical = [];
  const different = [];
  const missing = [];
  for (const id of ids) {
    if (!Object.hasOwn(baseEntries, id) || !Object.hasOwn(otherEntries, id)) missing.push(id);
    else if (baseEntries[id] === otherEntries[id]) identical.push(id);
    else different.push(id);
  }
  return {identical, different, missing};
}

/** JSON estável (chaves ordenadas) para calcular impressões digitais reprodutíveis. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
