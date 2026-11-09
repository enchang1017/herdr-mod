const WRAP = '"$@"; exec "$0" -li';

export const leadBase = (key, folderName) => `lead-${key ? key.toLowerCase() : folderName}`;

export const devTabId = (now) => `tb-dev-${now.toString(36)}`;

export function leadRunArgs({ name, folder, machine, space, tab, shell, argv }) {
  const labels = [`herdr.space=${space}`, `herdr.tab=${tab}`];
  return ["run", "--bg", "--json", "--keep", "--no-parent", "--name", name, "--cwd", folder,
    ...(machine ? ["--on", machine] : []), ...labels.flatMap((one) => ["--label", one]),
    "--", shell, "-lic", WRAP, shell, ...argv];
}
