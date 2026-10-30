// Predefined debugging challenges. The tests are trusted, data-driven fixtures owned by the
// server: each case calls one top-level function from the candidate code with JSON arguments
// and compares the JSON result. Only the candidate source is untrusted.

/**
 * @typedef {{ name: string, fn: string, args: unknown[], expected: unknown }} TestCase
 * @typedef {{
 *   id: string, title: string, description: string, language: 'typescript',
 *   tests: TestCase[], starterCode: string,
 *   demoSteps: { label: string, author: string, code: string }[],
 * }} Challenge
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

/** @type {Record<string, Challenge>} */
export const CHALLENGES = {
  'cart-total': {
    id: 'cart-total',
    title: 'Shopping cart total',
    description: 'calculateTotal(items) must return the sum of price × quantity over every item.',
    language: 'typescript',
    starterCode: CART_BASELINE,
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
};

/** What the browser may see about a challenge (everything; the tests are not secret). */
export function publicChallenge(c) {
  return { id: c.id, title: c.title, description: c.description, language: c.language, starterCode: c.starterCode, tests: c.tests, demoSteps: c.demoSteps };
}
