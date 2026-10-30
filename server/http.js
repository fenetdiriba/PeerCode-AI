// Small HTTP helpers shared by the JSON API routes.

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
export function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** An error whose message is safe to show the user, with the HTTP status to answer with. */
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/**
 * Read and parse a JSON body, rejecting anything larger than `maxBytes`.
 * @param {import('node:http').IncomingMessage} req
 */
export function readJson(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new HttpError(413, 'Request too large.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, 'Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

/** Sliding-window limiter: `limited(key)` records a hit and says whether it's over the limit. */
export function createRateLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map(); // key -> timestamps
  return (key) => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((ts) => t - ts < windowMs);
    const over = recent.length >= max;
    if (!over) recent.push(t);
    hits.set(key, recent);
    return over;
  };
}
