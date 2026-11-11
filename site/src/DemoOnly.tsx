import {DEMOS} from './demos';

export function DemoOnly({name}: {name: string}) {
  const Demo = DEMOS[name];
  if (!Demo) {
    return <p>Unknown demo: {name}</p>;
  }
  return (
    <main className="demo-only" id="example">
      <Demo />
    </main>
  );
}
