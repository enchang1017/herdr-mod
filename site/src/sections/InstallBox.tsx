import {useEffect, useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Selector} from '@astryxdesign/core/Selector';
import {Text} from '@astryxdesign/core/Text';
import {MODS, installPrompt} from '../data/mods';

type CopyState = 'idle' | 'copied' | 'failed';

const RESET_MS = 1800;

async function writeClipboard(text: string): Promise<void> {
  if (!navigator.clipboard) {
    throw new Error('Clipboard is not available in this browser');
  }
  await navigator.clipboard.writeText(text);
}

function selectText(el: HTMLElement | null): void {
  const selection = window.getSelection();
  if (!el || !selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

interface InstallBoxProps {
  initial: string;
  hasPicker?: boolean;
  id: string;
}

export function InstallBox({initial, hasPicker = true, id}: InstallBoxProps) {
  const [mod, setMod] = useState(initial);
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<number | undefined>(undefined);
  const code = useRef<HTMLElement>(null);
  const prompt = installPrompt(mod);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    window.clearTimeout(timer.current);
    try {
      await writeClipboard(prompt);
      setState('copied');
    } catch (err) {
      console.error('Copy failed', err);
      selectText(code.current);
      setState('failed');
    }
    timer.current = window.setTimeout(() => setState('idle'), RESET_MS);
  };

  const status = state === 'copied' ? 'Copied. Paste it to the agent in Herdr.' : state === 'failed' ? 'Copy was blocked. The text is selected: press ⌘C.' : '';

  return (
    <section className="install" id={id} aria-label="Install prompt" data-state={state}>
      {hasPicker && (
        <Selector
          label="Mod"
          size="lg"
          value={mod}
          onChange={setMod}
          options={MODS.map((m) => ({value: m.name, label: m.name}))}
        />
      )}
      <Text as="p" type="label" color="secondary">
        Say this to the agent running in Herdr
      </Text>
      <pre className="install-cmd">
        <code ref={code}>{prompt}</code>
      </pre>
      <footer className="install-actions">
        <Button variant="primary" size="lg" label={state === 'copied' ? 'Copied' : 'Copy the prompt'} onClick={copy} />
        <Text as="p" type="supporting" color="secondary">
          <output aria-live="polite">{status}</output>
        </Text>
      </footer>
    </section>
  );
}
