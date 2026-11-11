import type {ReactNode} from 'react';

interface FrameProps {
  label: string;
  dims: string;
  kind?: 'window' | 'popup' | 'sidebar' | 'drawer' | 'toast';
  children: ReactNode;
}

export function Frame({label, dims, kind = 'window', children}: FrameProps) {
  return (
    <figure className={`screen screen-${kind}`} role="img" aria-label={label}>
      <figcaption className="screen-dim">
        <i className="dim-line" aria-hidden="true" />
        <b>{dims}</b>
        <i className="dim-line" aria-hidden="true" />
      </figcaption>
      <section className="s-ui" aria-hidden="true">
        {children}
      </section>
    </figure>
  );
}

export function Bar({children}: {children: ReactNode}) {
  return <header className="s-bar">{children}</header>;
}

export function Title({children}: {children: ReactNode}) {
  return <b className="s-title">{children}</b>;
}

export function Chip({children, solid = false}: {children: ReactNode; solid?: boolean}) {
  return <mark className={solid ? 's-chip s-chip-solid' : 's-chip'}>{children}</mark>;
}

export function Kbd({children}: {children: ReactNode}) {
  return <kbd className="s-kbd">{children}</kbd>;
}

export function Dim({children}: {children: ReactNode}) {
  return <small className="s-dim">{children}</small>;
}

export function Push() {
  return <i className="s-push" />;
}

export function Tabs({items, active}: {items: readonly string[]; active: number}) {
  return (
    <nav className="s-tabs">
      {items.map((t, i) => (
        <mark key={t} className={i === active ? 's-tab s-tab-on' : 's-tab'}>
          {t}
        </mark>
      ))}
    </nav>
  );
}

export function Search({children}: {children: ReactNode}) {
  return <p className="s-search">{children}</p>;
}

export function Meter({value}: {value: number}) {
  return (
    <i className="s-meter">
      <i style={{inlineSize: `${value}%`}} />
    </i>
  );
}

export function Row({children, selected = false, tall = false}: {children: ReactNode; selected?: boolean; tall?: boolean}) {
  const cls = ['s-row', selected && 's-row-on', tall && 's-row-tall'].filter(Boolean).join(' ');
  return <li className={cls}>{children}</li>;
}

export function Line({children}: {children: ReactNode}) {
  return <p className="s-line">{children}</p>;
}

export function List({children}: {children: ReactNode}) {
  return <ul className="s-list">{children}</ul>;
}

export function Foot({children}: {children: ReactNode}) {
  return <footer className="s-foot">{children}</footer>;
}
