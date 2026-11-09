import { isPipelineActive } from "./ci.js";

const ORDER = { failed: 0, running: 1, idle: 2, passed: 3 };

export function bucketOf(pipeline) {
  if (!pipeline) return "idle";
  if (pipeline.status === "failed") return "failed";
  if (isPipelineActive(pipeline)) return "running";
  return pipeline.status === "success" ? "passed" : "idle";
}

function pipelineFor(remote, path, commits, mr) {
  const head = remote[`p|${path}|${commits[0].sha}`] ?? null;
  if (head?.data) return { pipeline: head.data, entry: head };
  if (mr?.pipeline) return { pipeline: mr.pipeline, entry: head };
  const older = commits.slice(1).map((c) => remote[`p|${path}|${c.sha}`]).find((e) => e?.data);
  return { pipeline: older?.data ?? null, entry: head };
}

function stagesFor(pipeline, ciEntry) {
  if (!pipeline) return null;
  if (pipeline.stages?.length) return pipeline.stages;
  const data = ciEntry?.data;
  return data?.pipeline?.id === pipeline.id && data.jobs?.stages?.length ? data.jobs.stages : null;
}

function repoTiles(s, repo, remote, ciOf) {
  const pushed = repo.commits.filter((c) => c.state === "pushed" && c.branch);
  return [...new Set(pushed.map((c) => c.branch))].map((branch) => {
    const commits = pushed.filter((c) => c.branch === branch);
    const mr = remote[`m|${repo.repo}|${branch}`]?.data ?? null;
    const found = pipelineFor(remote, repo.repo, commits, mr);
    return {
      key: `${repo.repo}|${branch}`, path: repo.repo, name: repo.name, branch, head: commits[0], sessionId: s.sessionId, live: Boolean(s.live),
      pipeline: found.pipeline, bucket: bucketOf(found.pipeline), stages: stagesFor(found.pipeline, ciOf(repo.repo)), mr,
      checked: Boolean(found.entry || found.pipeline), error: found.entry?.error ?? null,
    };
  });
}

export function sessionTiles(s, remote, ciOf) {
  const tiles = (s?.repos ?? []).flatMap((r) => repoTiles(s, r, remote, ciOf));
  return tiles.sort((a, b) => ORDER[a.bucket] - ORDER[b.bucket] || b.head.at - a.head.at);
}

export function tally(tiles) {
  const count = (bucket) => tiles.filter((x) => x.bucket === bucket).length;
  return { running: count("running"), failed: count("failed"), passed: count("passed") };
}

export function sessionBuckets(tracked, remote) {
  const entries = Object.values(tracked.sessions ?? {}).map((s) => {
    const counts = tally(sessionTiles(s, remote, () => null));
    return [s.sessionId, counts.failed ? "failed" : counts.running ? "running" : null];
  });
  return Object.fromEntries(entries.filter(([, bucket]) => bucket));
}
