import {describe, expect, it} from 'vitest';
import {buildDiagnosticReport, scrubDiagnosticText} from '../src/platform/diagnostics';

describe('scrubDiagnosticText', () => {
  it('remove caminhos locais Windows, UNC, file:// e POSIX de usuário', () => {
    const text = [
      'falha em D:\\Dev\\cobblemon-companion\\config.json',
      'em C:/Users/usuario1/AppData/x.js:10:5',
      'em \\\\servidor\\share\\mundo\\pokemon.dat',
      'em file:///D:/Dev/app/index.html',
      'em (/home/usuario1/jogo/world/party.dat)',
    ].join('\n');
    const scrubbed = scrubDiagnosticText(text);
    expect(scrubbed).not.toMatch(/usuario1|Dev|servidor|share|jogo/);
    expect(scrubbed.match(/\[caminho local\]/g)).toHaveLength(5);
  });

  it('remove UUIDs e SHA-256 em qualquer caixa', () => {
    const uuid = '123E4567-e89b-12d3-a456-426614174000';
    const hash = 'A'.repeat(32) + 'b'.repeat(32);
    expect(scrubDiagnosticText(`uuid ${uuid} hash ${hash}`)).toBe('uuid [uuid] hash [hash]');
  });

  it('preserva a origem do bundle do app, que não é dado do jogador', () => {
    const frame = 'at render (cobblemon://app/assets/index-abc123.js:12:34)';
    expect(scrubDiagnosticText(frame)).toBe(frame);
  });
});

describe('buildDiagnosticReport', () => {
  it('sanitiza mensagem, pilha e componentes e limita o tamanho', () => {
    const error = new Error('não achei C:\\Users\\usuario1\\world\\a.dat do jogador 123e4567-e89b-12d3-a456-426614174000');
    error.stack = `Error: x\n${Array.from({length: 200}, (_, i) => `at f${i} (D:\\Dev\\app\\f${i}.js:1:1)`).join('\n')}`;
    const report = buildDiagnosticReport({error, componentStack: '\n    at Painel (D:\\Dev\\app\\Painel.tsx:3:1)'});
    expect(report).not.toMatch(/usuario1|Dev|123e4567/);
    expect(report).toContain('Componentes:');
    expect(report.split('\n').length).toBeLessThan(60);
  });

  it('aceita valores lançados que não são Error', () => {
    expect(buildDiagnosticReport({error: 'texto solto em D:\\x\\y'})).toBe('string: texto solto em [caminho local]');
  });
});
