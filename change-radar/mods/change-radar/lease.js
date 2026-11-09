import { shared, setShared, props } from "herdr";

const asObject = (value) => (value && typeof value === "object" ? value : {});

export function copyId() {
  const place = props()?.overlay ?? props()?.pane ?? "block";
  return `${place}:${Math.random().toString(36).slice(2, 10)}`;
}

function live(leases, now) {
  return Object.fromEntries(Object.entries(leases).filter(([, lease]) => lease?.until > now));
}

export function claim(key, id, owner, ttl, now, force = false) {
  const leases = asObject(shared(key));
  const held = leases[id];
  if (!force && held && held.owner !== owner && held.until > now) return false;
  if (held?.owner === owner && held.until - now > ttl / 2) return true;
  setShared(key, { ...live(leases, now), [id]: { owner, until: now + ttl } });
  return true;
}

export function holds(key, id, owner, now) {
  const held = asObject(shared(key))[id];
  return Boolean(held) && held.owner === owner && held.until > now;
}

export function release(key, id, owner) {
  const leases = asObject(shared(key));
  if (leases[id]?.owner !== owner) return;
  setShared(key, Object.fromEntries(Object.entries(leases).filter(([k]) => k !== id)));
}

export function readShared(key) {
  return asObject(shared(key));
}
