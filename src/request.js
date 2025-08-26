const API = "https://api.tvmaze.com";

const cache = new Map();
const ttl = 5 * 60 * 1000;

const withTimeout = (ms) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, cancel: () => clearTimeout(t) };
};

const fromCache = (key) => {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > ttl) {
    cache.delete(key);
    return null;
  }
  return hit.data;
};

const toCache = (key, data) => cache.set(key, { t: Date.now(), data });

const getJSON = async (url) => {
  const key = `GET:${url}`;
  const hit = fromCache(key);
  if (hit) return hit;

  const { signal, cancel } = withTimeout(10000);
  try {
    const resp = await fetch(url, { signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    toCache(key, data);
    return data;
  } finally {
    cancel();
  }
};

export const getShowsByKey = (q) =>
  getJSON(`${API}/search/shows?q=${encodeURIComponent(q)}`);

export const getShowFullById = (id) =>
  getJSON(
    `${API}/shows/${encodeURIComponent(id)}?embed[]=episodes&embed[]=cast`
  );

export const getTopRatedShows = async () => {
  const pages = await Promise.all([
    getJSON(`${API}/shows?page=0`),
    getJSON(`${API}/shows?page=1`),
  ]);
  const flat = pages.flat().filter((s) => s?.rating?.average != null);
  flat.sort(
    (a, b) =>
      b.rating.average - a.rating.average || a.name.localeCompare(b.name)
  );
  return flat.slice(0, 100);
};

export const getScheduleForDate = (date, country) =>
  getJSON(
    `${API}/schedule?country=${encodeURIComponent(
      country
    )}&date=${encodeURIComponent(date)}`
  );
