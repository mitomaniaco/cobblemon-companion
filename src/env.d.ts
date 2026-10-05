/// <reference types="vite/client" />

declare module 'virtual:display-dex' {
  type PlayerStat = import('./platform/api').PlayerStat;
  const data: {
    species: Record<string, {name: string; types: string[]}>;
    moves: Record<string, {name: string; type: string; category: string; basePower: number}>;
    abilities: Record<string, string>;
    natures: Record<string, {name: string; plus: PlayerStat | null; minus: PlayerStat | null}>;
  };
  export default data;
}
