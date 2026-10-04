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

/** Extrai só os fatos que afetam o cálculo de dano da forma normal. */
export function speciesFacts(json) {
  const abilities = [];
  for (const entry of Array.isArray(json.abilities) ? json.abilities : []) {
    const id = String(entry).replace(/^h:/, '');
    if (id && !abilities.includes(id)) abilities.push(id);
  }
  const baseStats = {};
  for (const [source, target] of Object.entries(STAT_KEYS)) baseStats[target] = json.baseStats?.[source] ?? null;
  return {
    name: typeof json.name === 'string' ? json.name : null,
    implemented: json.implemented === true,
    types: [titleCase(json.primaryType), titleCase(json.secondaryType)].filter(Boolean),
    baseStats,
    weightHg: typeof json.weight === 'number' ? json.weight : null,
    abilities,
    forms: Array.isArray(json.forms) ? json.forms.length : 0,
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
    if (verdict.status === 'included') output[`cobblemon:${slug}`] = {name: entry.facts.name, abilities: verdict.abilities};
  }
  return output;
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
const MOVE_PRESENCE_KEYS = ['multihit', 'damage', 'ohko', 'selfdestruct', 'willCrit'];

/**
 * Lê `var Moves = {...}` do Showdown já compilado e devolve os fatos estruturais de cada golpe
 * (categoria, alvo, mecânicas especiais e callbacks). Chaves ausentes ficam `null`. O código nunca é executado.
 */
export function showdownMoveFacts(source) {
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
        for (const key of [...MOVE_FACT_KEYS, ...MOVE_FLAG_KEYS, ...MOVE_PRESENCE_KEYS]) facts[key] = null;
        for (const key of [...MOVE_FLAG_KEYS, ...MOVE_PRESENCE_KEYS]) facts[key] = false;
        facts.callbacks = [];
        for (const inner of property.value.properties) {
          if (inner.type !== 'Property') continue;
          const name = propertyName(inner);
          if (name === null) continue;
          if (inner.method || inner.value.type === 'FunctionExpression' || inner.value.type === 'ArrowFunctionExpression') {
            facts.callbacks.push(name);
          } else if (MOVE_FACT_KEYS.includes(name)) {
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

const DERIVABLE_TARGETS = new Set(['normal', 'any', 'allAdjacent', 'allAdjacentFoes', 'adjacentFoe']);
const EXCLUDED_NONSTANDARD = new Set(['LGPE', 'Gigantamax']);

/**
 * Decide se um golpe entra no catálogo. Golpes da lista-base revisada ficam sempre; os demais só entram se o
 * dano depender só de poder base, tipo, categoria e alvo simples, e se o @smogon/calc e os outros pacotes concordarem.
 * `critRatio` não exclui: o app não pede crítico ao calc.
 */
export function moveStatus(facts, {isBase, calcHasMove, packDiffers}) {
  if (isBase) return {status: 'base'};
  const exclude = (reason) => ({status: 'excluded', reason});
  if (facts.category !== 'Physical' && facts.category !== 'Special') return exclude('not-damaging');
  if (facts.isZ || facts.isMax || EXCLUDED_NONSTANDARD.has(facts.isNonstandard)) return exclude('nonstandard');
  if (!DERIVABLE_TARGETS.has(facts.target)) return exclude('target');
  if (facts.multihit || facts.damage || facts.ohko || facts.selfdestruct || facts.willCrit) return exclude('mechanics');
  if (facts.callbacks.length > 0) return exclude('callbacks');
  if (!calcHasMove) return exclude('calc-missing');
  if (packDiffers) return exclude('pack-override');
  return {status: 'derived'};
}

/** Mapa `moves` do catálogo (chave com namespace e alias sem), ordenado pelo id. */
export function deriveMovesCatalog(manifestMoves) {
  const output = {};
  for (const id of Object.keys(manifestMoves).sort()) {
    const entry = manifestMoves[id];
    if (entry.status !== 'base' && entry.status !== 'derived') continue;
    output[`cobblemon:${id}`] = {name: entry.name};
    output[id] = {name: entry.name};
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
