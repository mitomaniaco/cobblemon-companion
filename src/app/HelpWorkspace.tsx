import type {ReactNode} from 'react';
import {Button} from '../ui';
import styles from './HelpWorkspace.module.css';

const STEPS: Array<{title: string; body: ReactNode}> = [
  {
    title: 'Atualizar do save',
    body: (
      <>
        Lê party e PC. Antes, configure <code>config.json</code> (<code>serverRoot</code> e <code>playerUuid</code>) a partir de{' '}
        <code>config.example.json</code>.
      </>
    ),
  },
  {title: 'Escolha um Pokémon', body: 'Cada indivíduo é identificado pelo UUID, mesmo com espécies repetidas.'},
  {title: 'Planeje e calcule', body: 'Simule uma troca de golpe e veja o dano contra um alvo que você define.'},
];

export default function HelpWorkspace({onOpenDemo}: {onOpenDemo(): void}) {
  return (
    <section className={styles.help} aria-labelledby="help-title">
      <h2 id="help-title" tabIndex={-1}>
        Ajuda e diagnóstico
      </h2>
      <p className={styles.lead}>O Companion lê sua equipe e o PC do save local só quando você pede, e nunca grava no jogo.</p>

      <ol className={styles.steps}>
        {STEPS.map((step) => (
          <li key={step.title}>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className={styles.demo} aria-labelledby="demo-help-title">
        <div>
          <h3 id="demo-help-title">Demonstração offline</h3>
          <p>Pikachu → Floatzel com dados fixos, sem save.</p>
        </div>
        <Button variant="primary" onPress={onOpenDemo}>
          Abrir demonstração
        </Button>
      </section>

      <section className={styles.block} aria-labelledby="limits-title">
        <h3 id="limits-title">Limites</h3>
        <ul>
          <li>Não edita o save, não move Pokémon e não equipa golpes.</li>
          <li>Aparência, apelido, HP atual e stats totais não são capturados nem inventados.</li>
          <li>O cálculo usa o slot escolhido, um golpe aprendido e condições confirmadas por você.</li>
          <li>A ilustração representa a espécie na forma normal.</li>
          <li>
            Tipos, nomes e poder dos golpes vêm dos dados da espécie e do golpe (Showdown), não do indivíduo; formas alternativas aparecem
            sem tipo.
          </li>
        </ul>
      </section>

      <section className={styles.block} aria-labelledby="artwork-credit-title">
        <h3 id="artwork-credit-title">Ilustrações</h3>
        <p>
          PokéAPI/sprites, revisão <code>1aa1b0ca273d0e096469a9846155484920b11b45</code>; CSV de espécies, revisão{' '}
          <code>bc92d3b6029ef1abe9e7ad424c400b338f3c11fe</code>. Imagens © The Pokémon Company, preparadas só localmente; não distribua.
        </p>
      </section>
    </section>
  );
}
