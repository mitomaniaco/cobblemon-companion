export type PikaStarDisplayStatus = 'Verificado · concluído' | 'Não obtido' | 'Não verificado';

/** Mantém leitura válida sem advancement distinto de arquivo ausente ou inválido. */
export function pikaStarDisplayStatus(value: boolean | null): PikaStarDisplayStatus {
  if (value === true) return 'Verificado · concluído';
  if (value === false) return 'Não obtido';
  return 'Não verificado';
}
