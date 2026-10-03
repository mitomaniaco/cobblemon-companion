/** Contratos de arquitetura. Veja docs/GUIA-TECNICO.md (seção 3) para o mapa de camadas. */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Dependências circulares escondem acoplamento e quebram a ordem de inicialização.',
      from: {},
      to: {circular: true},
    },
    {
      name: 'renderer-nao-importa-electron',
      severity: 'error',
      comment:
        'O renderer não acessa o processo principal; só pode ler o catálogo JSON versionado, que é dado puro compartilhado. Toda outra comunicação passa pela bridge de src/platform/api.ts.',
      from: {path: '^src/'},
      to: {path: '^electron/', pathNot: '^electron/lib/combat-compatibility\\.json$'},
    },
    {
      name: 'electron-nao-importa-renderer',
      severity: 'error',
      comment: 'O processo principal não depende do código do renderer.',
      from: {path: '^electron/'},
      to: {path: '^src/'},
    },
    {
      name: 'ui-e-camada-base',
      severity: 'error',
      comment: 'Os primitivos de src/ui não dependem de features, domínio ou da aplicação.',
      from: {path: '^src/ui/'},
      to: {path: '^src/(features|domain|app|platform)/'},
    },
    {
      name: 'domain-e-puro',
      severity: 'error',
      comment: 'src/domain contém regras sem UI; só pode depender de src/platform (tipos) e de si mesmo.',
      from: {path: '^src/domain/'},
      to: {path: '^src/(features|ui|app)/'},
    },
    {
      name: 'features-nao-importam-app',
      severity: 'error',
      comment: 'A composição fica em src/app; features não importam a casca da aplicação.',
      from: {path: '^src/features/'},
      to: {path: '^src/app/'},
    },
    {
      name: 'features-isoladas',
      severity: 'warn',
      comment:
        'Uma feature não deve importar o interior de outra; compartilhe via domain, ui ou platform. Violação conhecida: individual → damage/MovePreparation (aviso até mover o componente).',
      from: {path: '^src/features/([^/]+)/'},
      to: {path: '^src/features/([^/]+)/', pathNot: '^src/features/$1/'},
    },
  ],
  options: {
    doNotFollow: {path: 'node_modules'},
    tsConfig: {fileName: 'tsconfig.json'},
    includeOnly: '^(src|electron)/',
    exclude: {path: '\\.(test|spec)\\.'},
  },
};
