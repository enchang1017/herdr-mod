import {Heading} from '@astryxdesign/core/Heading';
import {Link} from '@astryxdesign/core/Link';
import {Table, pixel, proportional, type TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {MODS, REPO_URL, type Mod} from '../data/mods';

const COLUMNS: TableColumn<Mod>[] = [
  {key: 'no', header: 'No.', width: pixel(72), renderCell: (m) => <Text type="code">{m.no}</Text>},
  {
    key: 'name',
    header: 'Mod',
    width: proportional(1.4, {minWidth: 170}),
    renderCell: (m) => (
      <Link href={`${REPO_URL}/tree/main/${m.name}`} className="mod-name">
        {m.name}
      </Link>
    ),
  },
  {key: 'does', header: 'What it does', width: proportional(2.2, {minWidth: 220})},
  {key: 'opens', header: 'Opens with', width: proportional(1, {minWidth: 120}), renderCell: (m) => <Text type="code">{m.opens}</Text>},
];

export function Register() {
  return (
    <section className="section register" id="register" aria-labelledby="register-title">
      <header className="container head-split">
        <Heading level={2} id="register-title">
          Every mod and its key
        </Heading>
        <Text as="p" type="large" color="secondary" className="lead">
          Install one, or all ten.
        </Text>
      </header>
      <section className="container register-table" aria-label="Mod register">
        <Table<Mod> data={[...MODS]} columns={COLUMNS} idKey="name" density="spacious" verticalAlign="top" />
      </section>
      <ol className="container register-list" aria-label="Mod register">
        {MODS.map((m) => (
          <li key={m.name}>
            <Link href={`${REPO_URL}/tree/main/${m.name}`} className="mod-name">
              {m.name}
            </Link>
            <Text as="p" color="secondary">{m.does}</Text>
            <Text type="code">{m.opens}</Text>
          </li>
        ))}
      </ol>
    </section>
  );
}
