import type {GuideAcquireEntry, GuideMatchup, GuideTeamMember} from '../../platform/api';

type GuideMoveDamage = GuideMatchup['damage'][number];
import {damageLevel, type DamageLevel} from '../../ui/HpBar';

/** Como a eficácia aparece: símbolo + texto, nunca só cor. `unknown` (eficácia nula) jamais vira 0 nem "Eficaz". */
export type EfficacyKind = 'super' | 'neutral' | 'resisted' | 'immune' | 'status' | 'unknown';

export type EfficacyView = {kind: EfficacyKind; label: string; multiplier: string | null};

const MULTIPLIERS: Record<number, string> = {4: '×4', 2: '×2', 0.5: '×½', 0.25: '×¼', 0: '×0'};

export function efficacyView(effectiveness: GuideMoveDamage['effectiveness'] | undefined, status = false): EfficacyView {
  if (status) return {kind: 'status', label: 'Golpe de status', multiplier: null};
  if (effectiveness === null || effectiveness === undefined) return {kind: 'unknown', label: 'Sem cálculo', multiplier: null};
  if (effectiveness === 0) return {kind: 'immune', label: 'Sem efeito', multiplier: MULTIPLIERS[0] ?? null};
  if (effectiveness > 1) return {kind: 'super', label: 'Super eficaz', multiplier: MULTIPLIERS[effectiveness] ?? null};
  if (effectiveness < 1) return {kind: 'resisted', label: 'Pouco eficaz', multiplier: MULTIPLIERS[effectiveness] ?? null};
  return {kind: 'neutral', label: 'Eficaz', multiplier: null};
}

/** Estado de um golpe equipado contra o adversário escolhido. */
export type MoveRow =
  | {kind: 'damage'; moveId: string; minPercent: number; maxPercent: number; efficacy: EfficacyView; level: DamageLevel; best: boolean}
  | {kind: 'status'; moveId: string}
  /** `inCatalog`: golpe do catálogo sem confronto calculado contra este adversário; false = fora do catálogo do jogo. */
  | {kind: 'blocked'; moveId: string; inCatalog: boolean};

export function moveRow(
  move: GuideTeamMember['moves'][number],
  damage: GuideMoveDamage | undefined,
  category: 'Physical' | 'Special' | 'Status' | null,
  bestMoveId: string | null,
): MoveRow {
  if (move.evaluated && damage) {
    return {
      kind: 'damage',
      moveId: move.id,
      minPercent: damage.minPercent,
      maxPercent: damage.maxPercent,
      efficacy: efficacyView(damage.effectiveness),
      level: damageLevel(damage.minPercent, damage.maxPercent),
      best: bestMoveId === move.id,
    };
  }
  if (category === 'Status') return {kind: 'status', moveId: move.id};
  return {kind: 'blocked', moveId: move.id, inCatalog: move.evaluated};
}

const trimmed = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ','));

/** "30–36%", "67%" ou "0%"; abaixo de 10% mantém uma casa para não esconder o dano. */
export function percentRangeLabel(minPercent: number, maxPercent: number): string {
  const part = (value: number) => trimmed(value < 10 ? Math.round(value * 10) / 10 : Math.round(value));
  const low = part(minPercent);
  const high = part(maxPercent);
  return low === high ? `${high}%` : `${low}–${high}%`;
}

/** Golpes para derrubar o adversário pelo dano garantido e pelo máximo; null quando o golpe não causa dano. */
export function hitsToKnockOut(minPercent: number, maxPercent: number): {fewest: number; most: number} | null {
  if (maxPercent <= 0) return null;
  const fewest = Math.ceil(100 / maxPercent);
  const most = minPercent > 0 ? Math.ceil(100 / minPercent) : fewest;
  return {fewest, most: Math.max(fewest, most)};
}

const hitsLabel = (count: number) => `${count} ${count === 1 ? 'golpe' : 'golpes'}`;

/** Frases do painel de foco: por que o golpe é o melhor ou como ele se sai neste confronto, a partir da eficácia, do STAB e da faixa. */
export function focusReasons(row: Extract<MoveRow, {kind: 'damage'}>, stab: boolean): {heading: string; lines: string[]} {
  const lines: string[] = [];
  if (row.efficacy.kind === 'super') lines.push(`${row.efficacy.label} contra este adversário (${row.efficacy.multiplier}).`);
  else if (row.efficacy.kind === 'resisted') lines.push(`${row.efficacy.label} contra este adversário (${row.efficacy.multiplier}).`);
  else if (row.efficacy.kind === 'immune') lines.push('O adversário não sofre dano deste golpe (×0).');
  else if (row.efficacy.kind === 'neutral') lines.push('Dano normal contra este adversário.');
  else lines.push('Não sabemos a eficácia deste golpe contra este adversário.');
  if (stab) lines.push('Tem o mesmo tipo do seu Pokémon e ganha bônus de 50%.');
  const hits = hitsToKnockOut(row.minPercent, row.maxPercent);
  lines.push(
    hits === null
      ? 'Não tira HP do adversário.'
      : `Tira ${percentRangeLabel(row.minPercent, row.maxPercent)} do HP; derruba em ${
          hits.fewest === hits.most ? hitsLabel(hits.fewest) : `${hits.fewest} a ${hitsLabel(hits.most)}`
        }.`,
  );
  return {heading: row.best ? 'Por que é o melhor' : 'Neste confronto', lines};
}

export type VerdictFact = {label: string; value: string; tone: 'win' | 'loss' | 'neutral'};

const turns = (count: number) => `${count} ${count === 1 ? 'turno' : 'turnos'}`;

/** Os cinco fatos do veredito; "Segura a troca" só tem sentido quando o Pokémon vence. */
export function verdictFacts(matchup: GuideMatchup): VerdictFact[] {
  const wins = matchup.outcome === 'vence';
  return [
    {label: 'Resultado', value: wins ? 'Vence' : 'Perde', tone: wins ? 'win' : 'loss'},
    {label: 'Turnos para derrubar', value: turns(matchup.ourTurns), tone: 'neutral'},
    {label: 'Turnos até cair', value: turns(matchup.theirTurns), tone: 'neutral'},
    {label: 'Quem age primeiro', value: matchup.faster ? 'Você' : 'Ele', tone: 'neutral'},
    {label: 'Segura a troca', value: wins ? (matchup.holds ? 'Sim' : 'Não') : '—', tone: 'neutral'},
  ];
}

/** Rota de aquisição em texto do jogador; o ovo avisa que exige um Pokémon novo. */
export function acquireRouteText(route: GuideAcquireEntry['route']): string {
  switch (route.kind) {
    case 'nível':
      return `Nível ${route.level}`;
    case 'tm':
      return 'TM';
    case 'tutor':
      return 'Tutor';
    case 'ovo':
      return 'Ovo · precisa de um Pokémon novo';
    default:
      return 'Outro meio';
  }
}

export const EGG_ROUTE_TOOLTIP =
  'Este golpe só vem de um filhote nascido de ovo (cruzamento). Não dá para ensiná-lo a este Pokémon: seria preciso um Pokémon novo.';

/** Resumo de precisão: ausente (nunca erra ou desconhecida) mostra "—", nunca 0. */
export function accuracyLabel(accuracy: number | null): string {
  return accuracy === null ? '—' : `${accuracy}%`;
}
