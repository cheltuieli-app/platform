// Copyright (c) 2023 Alexandru Catrina <alex@codeissues.net>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

const { strictEqual, throws } = require("assert");
const { index } = require(".");

const ds = [
  ['a', 'b', 'c', new Date('2022-12-12'), 0],
  ['a', 'b', 'c', new Date('2022-12-12'), 100],
  ['A', 'B', 'C', new Date('2022-12-12'), 200], // uppercase abc
  ['A', 'b', 'c', new Date('2022-12-12'), 300], // uppercase a
  ['aa', 'bb', 'c1', new Date('2022-12-19'), 400],
  ['aa', 'bb', 'c2', new Date('2022-12-19'), 500],
  ['aa', 'bb', 'c3', new Date('2022-12-19'), 600],
  ['aa', 'bb', 'c4', new Date('2022-12-19'), 700],
  ['aa', 'bb', 'c5', new Date('2022-12-19'), 800],
  ['x aa', 'x bb', 'x cc', new Date('2022-12-26'), 900],
  ['x aa', 'x bb', 'x cc', new Date('2023-01-02'), 901], // year +1
  ['n', 'n', 'k', new Date('2023-01-09'), 999],
  ['m', 'o', 'j', new Date('2023-01-09'), 1000],
  ['m', 'p', 'j', new Date('2023-01-09'), 1010],
].map(([a, b, c, d, s]) => {
  return { a, b, c, d, s };
});

describe('an expression has the grammar of a set-builder notation', () => {
  const fun = expr => index(ds, expr);

  it('must discard anything else', () => {
    strictEqual(fun('return all elements')[0].length, 0);
  });

  it('must discourage zero-clauses', () => {
    throws(() => fun(`{ }`), Error);
    throws(() => fun(`{  }`), Error);
  });

  it('must discard if non-clauses are used to describe', () => {
    throws(() => fun(`{x is a number or...}`), Error);
    throws(() => fun(`{return all elements}`), Error);
  });

  it('must discard if clauses are not used correct', () => {
    throws(() => fun(`{a>bb}`), Error);
    throws(() => fun(`{s==s}`), Error);
    throws(() => fun(`{a??a}`), Error);
    throws(() => fun(`{abcds}`), Error);
  });

});

describe('an expression of a subset can have one or more clauses', () => {
  const fun = expr => index(ds, expr)[0].length;

  it('must return one element', () => {
    strictEqual(fun(`{s = 0}`), 1);
  });

  it('must return three elements', () => {
    strictEqual(fun(`{d = 2022-12-12, s > 0}`), 3);
  });

  it(`must return all ${ds.length} elements`, () => {
    strictEqual(fun(`{s ≥ 0}`), ds.length);
    strictEqual(fun(`{s > -1}`), ds.length);
  });

  it('must return exact nr. of elements', () => {
    strictEqual(fun(`{s > -1, a = a}`), 2);
    strictEqual(fun(`{s > 0, a = A}`), 2);
    strictEqual(fun(`{s > 0, a = c}`), 0);
    strictEqual(fun(`{s > 0, c = c}`), 2);
    strictEqual(fun(`{a = A, b = B, c = C}`), 1);
    strictEqual(fun(`{b = b}`), 3);
    strictEqual(fun(`{c = C, d = 2022-12-12}`), 1);
  });

  it('must return elements that have matching text (contains)', () => {
    strictEqual(fun(`{b = b}`), 3);
    strictEqual(fun(`{b = B}`), 1);
    strictEqual(fun(`{b = x}`), 2);
    strictEqual(fun(`{b = x bb}`), 2);
    strictEqual(fun(`{b = bb}`), 7);
  });

  it('must return elements that have matching text ("as-is")', () => {
    strictEqual(fun(`{b = "bb"}`), 5);
    strictEqual(fun(`{b = "x"}`), 0);
    strictEqual(fun(`{b = "x bb"}`), 2);
  });

  it('must return elements that have approx. matching text (wildcard)', () => {
    strictEqual(fun(`{b = b*}`), 10);
    strictEqual(fun(`{b = *b}`), 10);
    strictEqual(fun(`{c = c*}`), 10);
    strictEqual(fun(`{c = C*}`), 1); // uppercase C
  });

  it('must return elements that have one or another matching text (union)', () => {
    strictEqual(fun(`{b = bb | p}`), 8);
  });

  it('must return elements with context-aware date formats', () => {
    strictEqual(fun(`{d = 2022}`), 10);
    strictEqual(fun(`{d = 2023}`), 4);
    strictEqual(fun(`{d = 2022-12-26}`), 1);
    strictEqual(fun(`{d > 2022-12-19}`), 5);
    strictEqual(fun(`{d < 2022-12-19}`), 4);
    strictEqual(fun(`{d = 2023-01}`), 4);
    strictEqual(fun(`{d < 2023-01}`), 10);
    strictEqual(fun(`{d < 2023-02}`), 14);
  });

  it('must return elements with sum in given internval', () => {
    strictEqual(fun('{s = 10 RON}'), 2);
    strictEqual(fun('{s = 10.00 RON}'), 1);
    strictEqual(fun('{s > 9.00 RON}'), 4); // first value above 9.00 is 9.01
    strictEqual(fun('{s > 9 RON}'), 2); // first value above 9's right range is 10
    strictEqual(fun('{s > 2 RON, s < 9 RON}'), 6);
  });

});

describe('more than one expression can describe a subset', () => {
  const fun = expr => index(ds, expr)[0].length;

  it('must return the union of two subsets', () => {
    strictEqual(fun('{s = 0} + {s = 10 RON}'), 3);
    strictEqual(fun('{s = 100} + {s = 900}'), 2);
    strictEqual(fun('{s = 1 RON} + {s = 9 RON}'), 4);
    strictEqual(fun('{s = 9 RON} + {s = 10 RON}'), 5);
    strictEqual(fun('{d = 2019} + {d = 2023}'), 4); // nothing for 2019
  });

  it('must return the difference between two subsets', () => {
    strictEqual(fun('{s > 0, b = bb} - {c = *cc}'), 5);
    strictEqual(fun('{d = 2022, s > 4 RON} - {s < 8 RON}'), 2);
  });

  it('must return the intersection between two subsets', () => {
    strictEqual(fun('{s > 0, b = bb} ~ {c = *cc}'), 2);
    strictEqual(fun('{d = 2022, s > 4 RON} ~ {s < 8 RON}'), 3);
  });

  it('must return a subset from a difference and an union', () => {
    strictEqual(fun('{d = 2022, s > 4 RON} - {s < 8 RON} + {d = 2023}'), 6);
  });

  it('must return all except what is described to be removed', () => {
    strictEqual(fun('{s > 0} - {d ≥ 2022-12-19}'), 3);
    strictEqual(fun('        - {d ≥ 2022-12-19}'), 4); // implicit left xs of all elements
  });

});

describe('has human-readable support for unicode ops. (≠, ≤, ≥)', () => {
  const fun = expr => index(ds, expr)[0].length;

  it('must return elements that greater or equal that given input', () => {
    strictEqual(fun('{s > 0} + {s = 0}'), 14);
    strictEqual(fun('{s ≥ 0}'), 14);
  });

  it('must return elements that less or equal that given input', () => {
    strictEqual(fun('{d < 2023, a = aa} + {d = 2023, a = aa}'), 7);
    strictEqual(fun('{d ≤ 2023, a = aa}'), 7);
  });

  it('must return elements that are NOT equal to given input', () => {
    strictEqual(fun('{c ≠ cc}'), 12);
    strictEqual(fun('{s ≠ 0, d ≠ 2022-12-19}'), 8);
  });

});

describe('can map 1:1 to the coresponding points', () => {

  it('must return only elements that have expected features', () => {
    const [xs, ,] = index(ds, '{d ≤ 2023, a = aa}');

    xs.forEach(pair => {
      const { a, d } = ds[pair.index];

      strictEqual(d.getFullYear() <= 2023, true);
      strictEqual(a.includes('aa'), true);
    });
  });

  it('must return elements that match day of week: Sunday', () => {
    const sunday = { a: 'x', b: 'y', c: 'z', d: new Date("2023-01-29"), s: 0 };
    const [xs, ,] = index([...ds, sunday], '{d = #1"}');

    strictEqual(xs.length, 1);
    strictEqual(xs[0].index, ds.length);
  });

  it('must tolerate whitespace in sum for readability improvements', () => {
    const million = { a: 'x1', b: 'x2', c: 'x3', d: new Date("2023-02-01"), s: 100000099 };
    const [xs, ,] = index([...ds, million], '{s = 1 000 000 RON}');

    strictEqual(xs.length, 1);
  });

});