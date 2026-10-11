import {useCallback, useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import styles from './TooltipLayer.module.css';

/** Atributos que marcam um elemento com tooltip: `data-tooltip` (texto) e `data-tooltip-heading` (título opcional). */
const TEXT = 'data-tooltip';
const HEADING = 'data-tooltip-heading';
const SHOW_DELAY_MS = 350;
const GAP = 8;
const EDGE = 8;

type Active = {target: Element; text: string; heading: string | null};
type Placement = {left: number; top: number; arrow: number; side: 'above' | 'below'};

const tooltipTarget = (node: EventTarget | null): Element | null => (node instanceof Element ? node.closest(`[${TEXT}]`) : null);

function readActive(target: Element): Active | null {
  const text = target.getAttribute(TEXT);
  return text ? {target, text, heading: target.getAttribute(HEADING)} : null;
}

/** Posição acima do elemento (abaixo se faltar espaço), centralizada e presa às bordas da janela; a seta aponta para o centro do elemento. */
function place(anchor: DOMRect, box: DOMRect): Placement {
  const side = anchor.top - box.height - GAP >= EDGE ? 'above' : 'below';
  const top = side === 'above' ? anchor.top - box.height - GAP : anchor.bottom + GAP;
  const center = anchor.left + anchor.width / 2;
  const left = Math.min(Math.max(center - box.width / 2, EDGE), Math.max(EDGE, window.innerWidth - box.width - EDGE));
  const arrow = Math.min(Math.max(center - left, 14), box.width - 14);
  return {left, top, arrow, side};
}

/**
 * Tooltip único do app, no lugar do balão nativo do Windows (atributo `title`). Qualquer elemento com `data-tooltip` mostra o
 * texto ao passar o mouse (com pequeno atraso) ou ao receber foco do teclado; Esc, rolagem e clique o fecham.
 * O elemento ganha `aria-describedby` enquanto o balão está aberto. Montar uma vez, na raiz.
 */
export function TooltipLayer() {
  const id = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const hide = useCallback(() => {
    setActive(null);
    setPlacement(null);
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const cancel = () => window.clearTimeout(timer);
    const show = (target: Element, delay: number) => {
      cancel();
      const next = readActive(target);
      if (!next) return;
      if (delay === 0) setActive(next);
      else timer = window.setTimeout(() => setActive(next), delay);
    };
    const onOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const target = tooltipTarget(event.target);
      if (target) show(target, SHOW_DELAY_MS);
    };
    const onOut = (event: PointerEvent) => {
      const target = tooltipTarget(event.target);
      if (target && !target.contains(event.relatedTarget as Node | null)) {
        cancel();
        hide();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = tooltipTarget(event.target);
      // O foco por clique já foi tratado pelo mouse; só o teclado abre o balão sem atraso.
      if (target?.matches(':focus-visible')) show(target, 0);
    };
    const onFocusOut = () => {
      cancel();
      hide();
    };
    const onDismiss = () => {
      cancel();
      hide();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('pointerdown', onDismiss, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onDismiss, true);
    window.addEventListener('blur', onDismiss);
    return () => {
      cancel();
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', onDismiss, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onDismiss, true);
      window.removeEventListener('blur', onDismiss);
    };
  }, [hide]);

  // O elemento pode sair da tela (re-render) com o balão aberto: fecha em vez de ficar órfão.
  useEffect(() => {
    if (!active) return;
    const {target} = active;
    target.setAttribute('aria-describedby', id);
    const observer = new MutationObserver(() => {
      if (!target.isConnected) hide();
      else if (target.getAttribute(TEXT) !== active.text) setActive(readActive(target));
    });
    observer.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: [TEXT]});
    return () => {
      observer.disconnect();
      target.removeAttribute('aria-describedby');
    };
  }, [active, hide, id]);

  useLayoutEffect(() => {
    if (!active || !boxRef.current) return;
    setPlacement(place(active.target.getBoundingClientRect(), boxRef.current.getBoundingClientRect()));
  }, [active]);

  if (!active) return null;
  return createPortal(
    <div
      ref={boxRef}
      id={id}
      role="tooltip"
      className={styles.tooltip}
      data-side={placement?.side}
      data-ready={placement ? 'true' : undefined}
      style={{left: placement?.left ?? 0, top: placement?.top ?? 0, '--arrow': `${placement?.arrow ?? 0}px`} as React.CSSProperties}
    >
      {active.heading && <strong className={styles.heading}>{active.heading}</strong>}
      <span className={styles.text}>{active.text}</span>
    </div>,
    document.body,
  );
}
