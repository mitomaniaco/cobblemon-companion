# Changelog

## Não lançado

- Adiciona uma tela de erro diagnóstica na raiz do renderer: exceções de renderização ou erros globais mostram um diagnóstico sanitizado e copiável em vez de uma janela vazia. Nada é enviado pela rede e não há novo IPC.

## 2026-10-02 — R1: Central de treinador

- Substitui a apresentação inicial por workspaces de Equipe, PC, Dano, Demonstração e Ajuda; o detalhe individual separa resumo, golpes e atributos capturados.
- Mantém identidade e propostas por UUID, invalida prévias e resultados dependentes quando a captura muda e encaminha ao cálculo real somente após confirmação explícita.
- Preserva a demonstração Pikachu/Floatzel como fluxo offline independente da captura do jogador.
- Adiciona preparação local e explícita de artwork com fontes e revisões fixadas. A preparação é opcional, não ocorre durante o uso e não autoriza redistribuir as imagens.
- Exercita os fluxos do TrainerApp no Electron com fixture sintética e verifica layouts em 1440, 1200, 800 CSS px e 200% de zoom.
- Inclui Gardevoir normal no catálogo compatível v10 com `Synchronize` e `Telepathy`; `Trace` permanece excluída por depender de copiar habilidade contextual. O adaptador continua v9 e os fingerprints das fontes não mudam.
