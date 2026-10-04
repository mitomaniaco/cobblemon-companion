import {Component, type ErrorInfo, type ReactNode} from 'react';
import {buildDiagnosticReport} from '../platform/diagnostics';
import {Button} from '../ui';
import styles from './AppErrorBoundary.module.css';

type Props = {children: ReactNode};
type State = {
  error: unknown;
  hasError: boolean;
  componentStack: string | null;
  copy: 'idle' | 'copied' | 'failed';
};

/**
 * Raiz de segurança do renderer: uma exceção de renderização desmontaria a árvore React e deixaria a janela vazia.
 * Mostra um diagnóstico sanitizado (sem caminhos, UUIDs ou hashes) e nada sai da máquina.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = {error: null, hasError: false, componentStack: null, copy: 'idle'};

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return {error, hasError: true};
  }

  componentDidMount() {
    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentDidCatch(_error: unknown, info: ErrorInfo) {
    this.setState({componentStack: info.componentStack ?? null});
  }

  // Erros sem objeto (ex.: "ResizeObserver loop completed...") são benignos e não devem derrubar a tela.
  private handleWindowError = (event: ErrorEvent) => {
    if (event.error === undefined || event.error === null) return;
    this.setState((current) => (current.hasError ? null : {error: event.error, hasError: true}));
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (event.reason === undefined || event.reason === null) return;
    this.setState((current) => (current.hasError ? null : {error: event.reason, hasError: true}));
  };

  private copyReport = async (report: string) => {
    try {
      await navigator.clipboard.writeText(report);
      this.setState({copy: 'copied'});
    } catch {
      this.setState({copy: 'failed'});
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const report = buildDiagnosticReport({error: this.state.error, componentStack: this.state.componentStack});
    return (
      <main className={styles.screen} role="alert" aria-labelledby="app-error-title" data-testid="app-error">
        <h1 id="app-error-title">A tela parou de responder</h1>
        <p>
          O aplicativo encontrou um erro e interrompeu a interface. A leitura do save é somente leitura: nada foi gravado no jogo. O
          diagnóstico abaixo foi sanitizado (sem caminhos locais, UUIDs ou hashes) e não é enviado a lugar nenhum. Copie-o ao relatar o
          problema.
        </p>
        <textarea className={styles.report} readOnly value={report} aria-label="Diagnóstico do erro" rows={14} spellCheck={false} />
        <div className={styles.actions}>
          <Button variant="primary" onPress={() => void this.copyReport(report)}>
            Copiar diagnóstico
          </Button>
          <Button onPress={() => window.location.reload()}>Recarregar</Button>
          <span className={styles.status} role="status">
            {this.state.copy === 'copied' && 'Diagnóstico copiado.'}
            {this.state.copy === 'failed' && 'Não foi possível copiar; selecione o texto manualmente.'}
          </span>
        </div>
      </main>
    );
  }
}
