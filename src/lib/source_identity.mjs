// A legal document's identity may live in ?uri=, ?id= or ?v=.
// Strip only known campaign trackers, never all query parameters.
export function sourceIdentity(value) {
  try {
    const u = new URL(value);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i.test(key)) {
        u.searchParams.delete(key);
      }
    }
    u.searchParams.sort();
    return u.hostname.toLowerCase().replace(/^www\./, '') + u.pathname.replace(/\/$/, '') + u.search;
  } catch {
    return String(value).trim();
  }
}
