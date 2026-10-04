export interface PokeBallMarkProps {
  className?: string;
  variant?: 'line' | 'filled';
  title?: string;
}

export function PokeBallMark({className, variant = 'line', title}: PokeBallMarkProps) {
  const a11y = title ? ({role: 'img'} as const) : ({'aria-hidden': true} as const);

  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative por padrão (aria-hidden); com `title` o <title> é renderizado logo abaixo
    <svg className={className} viewBox="0 0 48 48" fill="none" focusable="false" xmlns="http://www.w3.org/2000/svg" {...a11y}>
      {title && <title>{title}</title>}
      {variant === 'filled' ? (
        <>
          <path d="M2 24a22 22 0 0 1 44 0z" fill="var(--color-accent)" />
          <path d="M2 24a22 22 0 0 0 44 0z" fill="var(--color-text)" />
          <circle cx="24" cy="24" r="22" stroke="var(--color-canvas)" strokeWidth="3" />
          <path d="M2 24H18M30 24H46" stroke="var(--color-canvas)" strokeWidth="3" />
          <circle cx="24" cy="24" r="6" fill="var(--color-text)" stroke="var(--color-canvas)" strokeWidth="3" />
          <circle cx="24" cy="24" r="2.5" fill="var(--color-canvas)" />
        </>
      ) : (
        <>
          <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="3" />
          <path d="M2 24H18M30 24H46" stroke="currentColor" strokeWidth="3" />
          <circle cx="24" cy="24" r="6" stroke="currentColor" strokeWidth="3" />
          <circle cx="24" cy="24" r="2.5" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
