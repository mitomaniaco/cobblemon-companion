const MAX_LINES = 24;
const MAX_CHARACTERS = 4000;

const LOCAL_PATH_PLACEHOLDER = '[caminho local]';

// Ordem importa: URLs file:// e caminhos Windows/POSIX antes de UUIDs e hashes.
const SCRUBBERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/file:\/\/\/?[^\s)'"]+/gi, LOCAL_PATH_PLACEHOLDER],
  [/(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\s)'"]+/g, LOCAL_PATH_PLACEHOLDER],
  [/\\\\[^\s)'"\\]+\\[^\s)'"]+/g, LOCAL_PATH_PLACEHOLDER],
  [/(?:^|(?<=[\s(='"]))\/(?:Users|home|mnt|var|tmp|opt|root)\/[^\s)'"]+/g, LOCAL_PATH_PLACEHOLDER],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[uuid]'],
  [/\b[0-9a-f]{64}\b/gi, '[hash]'],
];

/** Remove de um texto de diagnóstico caminhos locais, UUIDs e hashes SHA-256. */
export function scrubDiagnosticText(text: string): string {
  return SCRUBBERS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

// Prefixo que o Electron acrescenta a erros lançados em handlers de ipcMain.handle.
const IPC_PREFIX = /^\s*(?:Uncaught\s+)?Error invoking remote method '[^']*':\s*(?:[A-Za-z]*Error:\s*)?/;

/** Remove o prefixo técnico do Electron, deixando só a mensagem original do erro. */
export function stripIpcErrorPrefix(message: string): string {
  const stripped = message.replace(IPC_PREFIX, '');
  return stripped.length > 0 ? stripped : message;
}

/** Texto de erro para o usuário: sem prefixo de IPC e sem caminhos, UUIDs ou hashes. */
export function describeError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return raw.length > 0 ? scrubDiagnosticText(stripIpcErrorPrefix(raw)) : fallback;
}

function boundedLines(text: string): string {
  const lines = text.split('\n').slice(0, MAX_LINES).join('\n');
  return lines.length > MAX_CHARACTERS ? `${lines.slice(0, MAX_CHARACTERS)}…` : lines;
}

export type DiagnosticInput = {
  error: unknown;
  componentStack?: string | null;
};

/** Monta um relatório copiável e sanitizado a partir de uma exceção do renderer. */
export function buildDiagnosticReport({error, componentStack}: DiagnosticInput): string {
  const name = error instanceof Error ? error.name : typeof error;
  const message = stripIpcErrorPrefix(error instanceof Error ? error.message : String(error));
  const stack = error instanceof Error && error.stack ? error.stack : '';
  const sections = [`${name}: ${message}`];
  if (stack) sections.push('Pilha:', boundedLines(stack));
  if (componentStack?.trim()) sections.push('Componentes:', boundedLines(componentStack.trim()));
  return scrubDiagnosticText(sections.join('\n'));
}
