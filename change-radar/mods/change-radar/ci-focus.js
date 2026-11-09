function focusPaths(app) {
  if (app.tab === "graph") return [app.graphTab.repo].filter(Boolean);
  if (app.tab === "session") return [...app.sessionTab.expanded];
  if (app.view.path) return [app.view.path];
  const row = app.selected == null ? null : app.radar.listed()[app.selected];
  return row ? [row.path] : [];
}

function target(app, path, priority) {
  const info = app.radar.info[path] ?? app.sessionTab.repos[path];
  return info?.upstream ? { path, branch: info.branch, priority } : null;
}

export function ciTargets(app) {
  const focus = new Set(focusPaths(app));
  const listed = app.radar.listed().map((row) => row.path);
  return [...new Set([...focus, ...listed])].map((path) => target(app, path, focus.has(path))).filter(Boolean);
}
