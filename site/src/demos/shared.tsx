import type {ReactNode} from 'react';
import {Spinner, Window} from '../stageshow/kit';

export type Status = 'working' | 'blocked' | 'done' | 'idle';

const LABEL: Record<Status, string> = {working: 'working', blocked: 'needs you', done: 'done', idle: 'idle'};

export function StatusChip({status}: {status: Status}) {
  return (
    <span className="hd-status" data-status={status}>
      <span className="hd-status__mark">
        <Spinner size={10} />
        <i className="hd-status__dot" />
      </span>
      <span className="hd-status__labels">
        {(Object.keys(LABEL) as Status[]).map((k) => (
          <span key={k} className="hd-status__label" data-on={k === status || undefined}>{LABEL[k]}</span>
        ))}
      </span>
    </span>
  );
}

export function Dot({status}: {status: Status}) {
  return <i className="hd-dot" data-status={status} />;
}

export function Term({children}: {children: ReactNode}) {
  return <div className="hd-term">{children}</div>;
}

export function Out({tone, children}: {tone?: 'ok' | 'dim' | 'warn' | 'cool'; children: ReactNode}) {
  return <div className="hd-out" data-tone={tone}>{children}</div>;
}

export function PaneHead({name, status, focused}: {name: string; status?: Status; focused?: boolean}) {
  return (
    <div className="hd-panehead" data-focused={focused || undefined}>
      <span className="hd-panehead__name">{name}</span>
      {status && <StatusChip status={status} />}
    </div>
  );
}

export function Tabs({items, active}: {items: readonly string[]; active: number}) {
  return (
    <div className="hd-tabs">
      {items.map((t, i) => (
        <span key={t} className="hd-tab" data-on={i === active || undefined}>{t}</span>
      ))}
    </div>
  );
}

export function Key({children}: {children: ReactNode}) {
  return <kbd className="hd-key">{children}</kbd>;
}

export function WinBar({hint = 'Go to', keys = '⌘P'}: {hint?: string; keys?: string}) {
  return (
    <span className="hd-winbar">
      <span>{hint}</span>
      <Key>{keys}</Key>
    </span>
  );
}

export function HerdrWindow({title = 'Herdr', hint, keys, children}: {title?: string; hint?: string; keys?: string; children: ReactNode}) {
  return (
    <Window title={title} toolbar={<WinBar hint={hint} keys={keys} />} className="hd-win">
      <div className="hd-body">{children}</div>
    </Window>
  );
}

export function Swap3({on, items}: {on: number; items: readonly ReactNode[]}) {
  return (
    <span className="hd-swap">
      {items.map((item, i) => (
        <span key={i} className="hd-swap__item" data-on={i === on || undefined}>{item}</span>
      ))}
    </span>
  );
}

export function Caret() {
  return <i className="hd-caret" />;
}

export function SearchField({value, placeholder}: {value: string; placeholder: string}) {
  return (
    <div className="hd-search">
      <span className="hd-search__ph" data-hide={value ? '' : undefined}>{placeholder}</span>
      <span className="hd-search__value">{value}</span>
      <Caret />
    </div>
  );
}
