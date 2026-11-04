// Predefined debugging challenges. The tests are trusted, data-driven fixtures owned by the
// server: each case calls one top-level function from the candidate code with JSON arguments
// and compares the JSON result. Only the candidate source is untrusted.

/**
 * @typedef {{ name: string, fn: string, args: unknown[], expected: unknown }} TestCase
 * @typedef {{
 *   id: string, title: string, description: string, language: 'typescript' | 'javascript',
 *   tests: TestCase[], starterCode: string,
 *   testNotes: string,
 *   support?: string,
 *   demoSteps: { label: string, author: string, code: string }[],
 * }} Challenge
 *
 * `support` is optional trusted test code (e.g. a scenario driver) that runs after the
 * candidate code; test cases may call its functions. `testNotes` tells the model (and the UI)
 * how the tests exercise the code.
 */

const CART_BASELINE = `type CartItem = { price: number; quantity: number };

function calculateTotal(items: CartItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
}
`;

const CART_WITH_FORMAT = `type CartItem = { price: number; quantity: number };

function calculateTotal(items: CartItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
}

function formatPrice(amount: number): string {
  return "$" + amount.toFixed(2);
}
`;

// The regression: "simplify the reducer" drops the quantity multiplication.
const CART_BUGGY = `type CartItem = { price: number; quantity: number };

function calculateTotal(items: CartItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.price,
    0
  );
}

function formatPrice(amount: number): string {
  return "$" + amount.toFixed(2);
}
`;

const CART_BUGGY_PLUS_COUNT = `type CartItem = { price: number; quantity: number };

function calculateTotal(items: CartItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.price,
    0
  );
}

function formatPrice(amount: number): string {
  return "$" + amount.toFixed(2);
}

function itemCount(items: CartItem[]): number {
  return items.reduce((n, item) => n + item.quantity, 0);
}
`;

const CART_BUGGY_PLUS_SUMMARY = `type CartItem = { price: number; quantity: number };

function calculateTotal(items: CartItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.price,
    0
  );
}

function formatPrice(amount: number): string {
  return "$" + amount.toFixed(2);
}

function itemCount(items: CartItem[]): number {
  return items.reduce((n, item) => n + item.quantity, 0);
}

function cartSummary(items: CartItem[]): string {
  return itemCount(items) + " items, " + formatPrice(calculateTotal(items));
}
`;

// ---- Typeahead search: a stale-response regression -------------------------------------

const SEARCH_BASELINE = `// Typeahead search store. setQuery() runs for every keystroke.
// Responses can arrive out of order, so only the latest request may update state.
function createSearch(fetchResults) {
  let state = { status: 'idle', query: '', results: [], error: null };
  let latestRequest = 0;

  async function setQuery(rawQuery) {
    const requestId = ++latestRequest;
    const query = rawQuery.trim();
    if (query === '') {
      state = { status: 'idle', query: '', results: [], error: null };
      return;
    }
    state = { ...state, status: 'loading', query, error: null };
    try {
      const results = await fetchResults(query);
      if (requestId !== latestRequest) return; // a newer keystroke superseded this request
      state = { ...state, status: 'success', results };
    } catch (err) {
      if (requestId !== latestRequest) return;
      state = { ...state, status: 'error', results: [], error: err.message };
    }
  }

  return { setQuery, getState: () => state };
}
`;

const SEARCH_WITH_SUBSCRIBE = `// Typeahead search store. setQuery() runs for every keystroke.
// Responses can arrive out of order, so only the latest request may update state.
function createSearch(fetchResults) {
  let state = { status: 'idle', query: '', results: [], error: null };
  let latestRequest = 0;
  const listeners = new Set();

  function update(patch) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  }

  async function setQuery(rawQuery) {
    const requestId = ++latestRequest;
    const query = rawQuery.trim();
    if (query === '') {
      update({ status: 'idle', query: '', results: [], error: null });
      return;
    }
    update({ status: 'loading', query, error: null });
    try {
      const results = await fetchResults(query);
      if (requestId !== latestRequest) return; // a newer keystroke superseded this request
      update({ status: 'success', results });
    } catch (err) {
      if (requestId !== latestRequest) return;
      update({ status: 'error', results: [], error: err.message });
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { setQuery, subscribe, getState: () => state };
}
`;

// The regression: extracting runSearch() moves the request counter into the helper, so the
// blank-query path no longer invalidates a request that is still in flight.
const SEARCH_EXTRACTED = `// Typeahead search store. setQuery() runs for every keystroke.
// Responses can arrive out of order, so only the latest request may update state.
function createSearch(fetchResults) {
  let state = { status: 'idle', query: '', results: [], error: null };
  let latestRequest = 0;
  const listeners = new Set();

  function update(patch) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  }

  async function runSearch(query) {
    const requestId = ++latestRequest;
    update({ status: 'loading', query, error: null });
    try {
      const results = await fetchResults(query);
      if (requestId !== latestRequest) return; // a newer keystroke superseded this request
      update({ status: 'success', results });
    } catch (err) {
      if (requestId !== latestRequest) return;
      update({ status: 'error', results: [], error: err.message });
    }
  }

  function setQuery(rawQuery) {
    const query = rawQuery.trim();
    if (query === '') {
      update({ status: 'idle', query: '', results: [], error: null });
      return Promise.resolve();
    }
    return runSearch(query);
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { setQuery, subscribe, getState: () => state };
}
`;

const SEARCH_WITH_RETRY = SEARCH_EXTRACTED.replace(
  `  function subscribe(listener) {`,
  `  // Re-run the current query after a failed request.
  function retry() {
    return state.status === 'error' ? runSearch(state.query) : Promise.resolve();
  }

  function subscribe(listener) {`,
).replace(`return { setQuery, subscribe, getState: () => state };`, `return { setQuery, retry, subscribe, getState: () => state };`);

const SEARCH_WITH_SELECTORS = SEARCH_WITH_RETRY.replace(
  `return { setQuery, retry, subscribe, getState: () => state };`,
  `const isLoading = () => state.status === 'loading';
  const resultCount = () => state.results.length;

  return { setQuery, retry, subscribe, isLoading, resultCount, getState: () => state };`,
);

// Trusted driver: fetchResults returns promises that stay pending until a step resolves or
// rejects them (by call index), and every step is followed by a microtask flush. No timers,
// so each scenario runs in exactly the same order every time.
const SEARCH_SUPPORT = `
function flushMicrotasks() {
  let p = Promise.resolve();
  for (let i = 0; i < 25; i++) p = p.then(() => {});
  return p;
}
async function runScenario(steps) {
  const calls = [];
  const fetchResults = (query) => new Promise((resolve, reject) => calls.push({ query, resolve, reject }));
  const factory = typeof createSearch === 'function' ? createSearch : module.exports.createSearch;
  const search = factory(fetchResults);
  for (const [action, a, b] of steps) {
    if (action === 'type') Promise.resolve(search.setQuery(a)).catch(() => {});
    else if (action === 'resolve') calls[a].resolve(b);
    else if (action === 'reject') calls[a].reject(new Error(b));
    await flushMicrotasks();
  }
  const { status, query, results, error } = search.getState();
  return { state: { status, query, results, error }, fetched: calls.map((c) => c.query) };
}
`;

const idle = { status: 'idle', query: '', results: [], error: null };

/** @type {Record<string, Challenge>} */
export const CHALLENGES = {
  'cart-total': {
    id: 'cart-total',
    title: 'Shopping cart total',
    description: 'calculateTotal(items) must return the sum of price × quantity over every item.',
    language: 'typescript',
    starterCode: CART_BASELINE,
    testNotes: 'Each test calls calculateTotal(items) and compares the return value exactly.',
    // Prices are exact in binary floating point, so expected values compare exactly.
    tests: [
      { name: 'empty cart totals 0', fn: 'calculateTotal', args: [[]], expected: 0 },
      { name: 'single item, quantity 1', fn: 'calculateTotal', args: [[{ price: 12.5, quantity: 1 }]], expected: 12.5 },
      { name: 'single item, quantity 3', fn: 'calculateTotal', args: [[{ price: 4, quantity: 3 }]], expected: 12 },
      {
        name: 'mixed cart with quantities',
        fn: 'calculateTotal',
        args: [[{ price: 2.5, quantity: 4 }, { price: 10, quantity: 1 }, { price: 0.75, quantity: 2 }]],
        expected: 21.5,
      },
      { name: 'zero quantity contributes nothing', fn: 'calculateTotal', args: [[{ price: 99, quantity: 0 }, { price: 1, quantity: 2 }]], expected: 2 },
    ],
    // A realistic two-person history: two harmless edits, the regression, then more edits on top.
    demoSteps: [
      { label: 'Baseline cart total', author: 'Developer A', code: CART_BASELINE },
      { label: 'Add formatPrice helper', author: 'Developer A', code: CART_WITH_FORMAT },
      { label: 'Simplify reducer', author: 'Developer B', code: CART_BUGGY },
      { label: 'Add itemCount', author: 'Developer A', code: CART_BUGGY_PLUS_COUNT },
      { label: 'Add cartSummary', author: 'Developer B', code: CART_BUGGY_PLUS_SUMMARY },
    ],
  },
  'search-race': {
    id: 'search-race',
    title: 'Typeahead search: stale responses',
    description:
      'createSearch(fetchResults) returns a store whose setQuery(text) runs on every keystroke. Out-of-order responses must never overwrite newer state; a blank query shows the idle state and must not be overwritten by a request that was still in flight.',
    language: 'javascript',
    starterCode: SEARCH_BASELINE,
    testNotes:
      'Each test is a scenario run by the trusted driver runScenario(steps): fetchResults returns a promise that stays pending until a step resolves or rejects it by call index (0 = first fetch). Steps are ["type", text], ["resolve", i, results], ["reject", i, message]; all microtasks are flushed after every step. The result is the final getState() fields and the list of fetched queries.',
    support: SEARCH_SUPPORT,
    tests: [
      {
        name: 'single search succeeds',
        fn: 'runScenario',
        args: [[['type', 'react'], ['resolve', 0, ['React', 'Preact']]]],
        expected: { state: { status: 'success', query: 'react', results: ['React', 'Preact'], error: null }, fetched: ['react'] },
      },
      {
        name: 'shows loading while the request is pending',
        fn: 'runScenario',
        args: [[['type', 'svelte']]],
        expected: { state: { status: 'loading', query: 'svelte', results: [], error: null }, fetched: ['svelte'] },
      },
      {
        name: 'out-of-order responses: the latest query wins',
        fn: 'runScenario',
        args: [[['type', 're'], ['type', 'react'], ['resolve', 1, ['React']], ['resolve', 0, ['Redux', 'React']]]],
        expected: { state: { status: 'success', query: 'react', results: ['React'], error: null }, fetched: ['re', 'react'] },
      },
      {
        name: 'clearing the input discards an in-flight search',
        fn: 'runScenario',
        args: [[['type', 'rea'], ['type', ''], ['resolve', 0, ['React']]]],
        expected: { state: idle, fetched: ['rea'] },
      },
      {
        name: 'a stale error after clearing is ignored',
        fn: 'runScenario',
        args: [[['type', 'rea'], ['type', '   '], ['reject', 0, 'Network timeout']]],
        expected: { state: idle, fetched: ['rea'] },
      },
      {
        name: 'blank input never fetches',
        fn: 'runScenario',
        args: [[['type', '   ']]],
        expected: { state: idle, fetched: [] },
      },
      {
        name: 'a failed current request shows the error',
        fn: 'runScenario',
        args: [[['type', 'vue'], ['reject', 0, 'Network down']]],
        expected: { state: { status: 'error', query: 'vue', results: [], error: 'Network down' }, fetched: ['vue'] },
      },
      {
        name: 'searching again after clearing works',
        fn: 'runScenario',
        args: [[['type', 'a'], ['type', ''], ['type', 'b'], ['resolve', 0, ['A']], ['resolve', 1, ['B']]]],
        expected: { state: { status: 'success', query: 'b', results: ['B'], error: null }, fetched: ['a', 'b'] },
      },
    ],
    demoSteps: [
      { label: 'Typeahead with stale-response guard', author: 'Developer A', code: SEARCH_BASELINE },
      { label: 'Add subscribe() for UI updates', author: 'Developer A', code: SEARCH_WITH_SUBSCRIBE },
      { label: 'Extract runSearch helper', author: 'Developer B', code: SEARCH_EXTRACTED },
      { label: 'Add retry() after errors', author: 'Developer B', code: SEARCH_WITH_RETRY },
      { label: 'Add isLoading / resultCount selectors', author: 'Developer A', code: SEARCH_WITH_SELECTORS },
    ],
  },
};

/** What the browser may see about a challenge (everything; the tests are not secret). */
export function publicChallenge(c) {
  return { id: c.id, title: c.title, description: c.description, language: c.language, starterCode: c.starterCode, testNotes: c.testNotes, tests: c.tests, demoSteps: c.demoSteps };
}
