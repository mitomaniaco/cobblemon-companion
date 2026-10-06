import type {CSSProperties} from 'react';
import {MAX_IV} from '../../domain/stats-format';
import type {PlayerStat} from '../../platform/api';
import styles from './IvRadar.module.css';

export type IvValue = number | null;

export interface IvRadarProps {
  ivs: Record<PlayerStat, IvValue>;
  /** Cor CSS do polígono (ex.: `var(--type-psychic)`). */
  accent: string;
}

const CENTER = 100;
const RADIUS = 80;

const AXES: ReadonlyArray<{key: PlayerStat; label: string; angle: number}> = [
  {key: 'hp', label: 'HP', angle: -90},
  {key: 'atk', label: 'Ataque', angle: -30},
  {key: 'def', label: 'Defesa', angle: 30},
  {key: 'spe', label: 'Velocidade', angle: 90},
  {key: 'spd', label: 'Def. especial', angle: 150},
  {key: 'spa', label: 'At. especial', angle: 210},
];

function point(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return {x: CENTER + radius * Math.cos(radians), y: CENTER + radius * Math.sin(radians)};
}

function ring(fraction: number) {
  return AXES.map((axis) => {
    const {x, y} = point(axis.angle, RADIUS * fraction);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function IvRadar({ivs, accent}: IvRadarProps) {
  const polygon = AXES.map((axis) => {
    const {x, y} = point(axis.angle, (RADIUS * (ivs[axis.key] ?? 0)) / MAX_IV);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const description = AXES.map((axis) => `${axis.label} ${ivs[axis.key] ?? 'não capturado'}`).join(', ');
  const style = {'--radar-accent': accent} as CSSProperties;

  return (
    <svg className={styles.radar} style={style} viewBox="-70 -8 340 216" role="img" aria-label={`IVs: ${description}`}>
      {[1 / 3, 2 / 3, 1].map((fraction) => (
        <polygon key={fraction} className={styles.ring} points={ring(fraction)} />
      ))}
      {AXES.map((axis) => {
        const end = point(axis.angle, RADIUS);
        return <line key={axis.key} className={styles.axis} x1={CENTER} y1={CENTER} x2={end.x} y2={end.y} />;
      })}
      <g className={styles.shape}>
        <polygon className={styles.area} points={polygon} />
      </g>
      {AXES.map((axis) => {
        const {x, y} = point(axis.angle, RADIUS + 12);
        const anchor = Math.abs(x - CENTER) < 1 ? 'middle' : x > CENTER ? 'start' : 'end';
        return (
          <text key={axis.key} className={styles.label} x={x} y={y} textAnchor={anchor} dominantBaseline="middle">
            {axis.label} {ivs[axis.key] ?? '?'}
          </text>
        );
      })}
    </svg>
  );
}
