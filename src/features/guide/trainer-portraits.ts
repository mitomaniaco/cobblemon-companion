type Portraits = {readonly default: string | null; readonly trainers: Readonly<Record<string, string>>};

// O manifesto é gerado por `npm run prepare:trainer-portraits` e não é versionado. Sem ele, não há retrato.
const manifests = import.meta.glob<Portraits>('../../data/trainer-portraits.json', {eager: true, import: 'default'});
const portraits: Portraits = Object.values(manifests)[0] ?? {default: null, trainers: {}};

/** Caminho do retrato (skin do RCT) do treinador, ou o padrão do RCT; null sem retratos preparados. */
export function trainerPortraitPath(trainerId: string): string | null {
  const id = trainerId.includes(':') ? trainerId.slice(trainerId.indexOf(':') + 1) : trainerId;
  return portraits.trainers[id] ?? portraits.default;
}
