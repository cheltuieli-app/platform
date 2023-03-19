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

const { strictEqual } = require('assert');
const calculate = require('./backend').default;

const dataset = [
  ['Alexandru', 'b', 'c', new Date('2023-01-01'), 0],
  ['Alexandru', 'b', 'c', new Date('2023-01-01'), 5000],
  ['aaa aaaaa', 'b', 'c', new Date('2023-01-01'), 5010],
  ['aaa aaaaa', 'b', 'c', new Date('2023-01-01'), 5020],
  ['aaa aaaaa', 'b', 'c', new Date('2023-01-01'), 6000],
].map(([a, b, c, d, s]) => ({ a, b, c, d, s }));

describe(`evaluate abstract DSL on app's platform`, () => {

  it('must run program against a small dataset', () => {
    const content = [
      {
        ref: 'min sum',
        value: 'min: {s ≤ 50 RON} ~ {s ≠ 0}',
      },
      {
        ref: 'max sum',
        value: 'max: {s ≥ 50 RON}',
      },
      {
        value: 'range: {a = Alexandru}',
      }
    ];

    const { results, errors } = calculate(dataset, content);

    strictEqual(errors.length, 0);
    strictEqual(Object.keys(results).length, 5);

    strictEqual(results['min: {s ≤ 50 RON} ~ {s ≠ 0}'][0].length, 3);
    strictEqual(results['min: {s ≤ 50 RON} ~ {s ≠ 0}'][1], "index");
    strictEqual(results['min: {s ≤ 50 RON} ~ {s ≠ 0}'][2], 0);
    strictEqual(results['min: {s ≤ 50 RON} ~ {s ≠ 0}'][0][0].value, 5000);

    strictEqual(results['min: {s ≤ 50 RON} ~ {s ≠ 0}'][0].length, results['min sum'][0].length);
    strictEqual(results['min: {s ≤ 50 RON} ~ {s ≠ 0}'][1], results['min sum'][1]);
    strictEqual(results['min: {s ≤ 50 RON} ~ {s ≠ 0}'][2], results['min sum'][2]);
    strictEqual(results['min: {s ≤ 50 RON} ~ {s ≠ 0}'][0][0].value, results['min sum'][0][0].value);

    strictEqual(results['max: {s ≥ 50 RON}'][0].length, 4);
    strictEqual(results['max: {s ≥ 50 RON}'][1], "index");
    strictEqual(results['max: {s ≥ 50 RON}'][2], 3);
    strictEqual(results['max: {s ≥ 50 RON}'][0][3].value, 6000);

    strictEqual(results['max: {s ≥ 50 RON}'][0].length, results['max sum'][0].length);
    strictEqual(results['max: {s ≥ 50 RON}'][1], results['max sum'][1]);
    strictEqual(results['max: {s ≥ 50 RON}'][2], results['max sum'][2]);
    strictEqual(results['max: {s ≥ 50 RON}'][0][3].value, results['max sum'][0][3].value);

    strictEqual(results['range: {a = Alexandru}'][0].length, 2);
    strictEqual(results['range: {a = Alexandru}'][1], "value");
    strictEqual(results['range: {a = Alexandru}'][2], 5000);
  });

  it('must run program against an updated dataset', () => {
    const content = [
      {
        value: '{a = Alexandru, s > max sum}',
      },
      {
        ref: 'max sum',
        value: 'max: {a = aaa, s ≥ 50 RON}',
      }
    ];

    const xs = [
      ['Alexandru', 'b', 'c', new Date('2023-01-02'), 8500],
      ['Alexandru', 'b', 'c', new Date('2023-01-02'), 8600],
    ].map(([a, b, c, d, s]) => ({ a, b, c, d, s }));

    const { results, errors } = calculate([...dataset, ...xs], content);

    strictEqual(errors.length, 0);
    strictEqual(Object.keys(results).length, 3);

    strictEqual(results['{a = Alexandru, s > max sum}'][0].length, 2);
    strictEqual(results['{a = Alexandru, s > max sum}'][1], "tuple");
    strictEqual(results['{a = Alexandru, s > max sum}'][2], NaN);
    strictEqual(results['{a = Alexandru, s > max sum}'][0][0].value, 8500);
    strictEqual(results['{a = Alexandru, s > max sum}'][0][1].value, 8600);

    strictEqual(results['max: {a = aaa, s ≥ 50 RON}'][0].length, results['max sum'][0].length);
    strictEqual(results['max: {a = aaa, s ≥ 50 RON}'][1], results['max sum'][1]);
    strictEqual(results['max: {a = aaa, s ≥ 50 RON}'][2], results['max sum'][2]);
    strictEqual(results['max: {a = aaa, s ≥ 50 RON}'][0][0].value, results['max sum'][0][0].value);
    strictEqual(results['max: {a = aaa, s ≥ 50 RON}'][0][1].value, results['max sum'][0][1].value);
  });

});

describe(`evaluate user defined function as part of DSL`, () => {

  it('must load and parse custom udfs in memory', () => {
    const content = [
      {
        value: 'udf_0: {s > 0}',
      },
      {
        def: 'local',
        ref: 'udf_0',
        value: `s + 10% *s, s < 6000; s + 1`,
      }
    ];

    const { results, errors } = calculate(dataset, content);

    strictEqual(errors.length, 0);
    strictEqual(Object.keys(results).length, 1);

    strictEqual(results['udf_0: {s > 0}'][0].length, 4);
    strictEqual(results['udf_0: {s > 0}'][1], 'tuple');
    // these are not tuples, but backward compatible array-like tuples
    strictEqual(results['udf_0: {s > 0}'][0][0][0], 5000 + 0.1 * 5000);
    strictEqual(results['udf_0: {s > 0}'][0][1][0], 5010 + 0.1 * 5010);
    strictEqual(results['udf_0: {s > 0}'][0][2][0], 5020 + 0.1 * 5020);
    strictEqual(results['udf_0: {s > 0}'][0][3][0], 6000 + 1);
  });

  it('must continue working correct with bifs', () => {
    const xs = [
      ['Alexandru', 'b', 'c', new Date('2023-01-24'), 1100],
      ['Alexandru', 'b', 'c', new Date('2023-01-24'), 1150],
      ['Alexandru', 'b', 'c', new Date('2023-01-24'), 1200],
    ].map(([a, b, c, d, s]) => ({ a, b, c, d, s }));

    const content = [
      {
        def: 'local',
        ref: 'today',
        value: '2023-01-24',
      },
      {
        value: 'avg: {s = 11 RON}',
      },
      {
        ref: 'max sum today',
        value: 'max: {d = today}',
      }
    ];

    const { results, errors } = calculate([...dataset, ...xs], content);

    strictEqual(errors.length, 0);
    strictEqual(Object.keys(results).length, 3);

    strictEqual(results['avg: {s = 11 RON}'][0].length, 2);
    strictEqual(results['avg: {s = 11 RON}'][1], "value");
    strictEqual(results['avg: {s = 11 RON}'][2], 1125);
    strictEqual(results['avg: {s = 11 RON}'][0][0].value, 1100);
    strictEqual(results['avg: {s = 11 RON}'][0][1].value, 1150);

    strictEqual(results['max: {d = today}'][0].length, 3);
    strictEqual(results['max: {d = today}'][1], "index");
    strictEqual(results['max: {d = today}'][2], 2);
    strictEqual(results['max: {d = today}'][0][0].value, 1100);
    strictEqual(results['max: {d = today}'][0][1].value, 1150);
    strictEqual(results['max: {d = today}'][0][2].value, 1200);

    strictEqual(results['max: {d = today}'][0].length, results['max sum today'][0].length);
    strictEqual(results['max: {d = today}'][1], results['max sum today'][1]);
    strictEqual(results['max: {d = today}'][2], results['max sum today'][2]);
    strictEqual(results['max: {d = today}'][0][0].value, results['max sum today'][0][0].value);
    strictEqual(results['max: {d = today}'][0][1].value, results['max sum today'][0][1].value);
    strictEqual(results['max: {d = today}'][0][2].value, results['max sum today'][0][2].value);
  });

});

describe('start a new interpreter to run program with macros', () => {
  const data = [
    600,
    700,
    800,
    900,
    999,
  ].map(s => {
    return { a: '', b: '', c: '', d: new Date(), s };
  });

  const program = [
    ['max: {s>0}', 'max value of #90'],
    ['min: {s>0}', null],
    ['mode: {s>0, d=value0}', null],
    ['median: {s>0, d=value1}', null],
    ['midrange: set #93', null],
    ['udf(-1): {s=max value of #90}', null],
    ['tuple: sum: {s < max value of #90}', 'set #93'],
  ].map(([value, ref]) => {
    return { ref, value };
  });

  const completeProgram = [
    ...program,
    { def: 'local', value: '2022', ref: 'value0' },
    { def: 'local', value: '2023', ref: 'value1' },
    { def: 'local', value: 'x * -1', ref: 'udf(-1)' },
  ];

  const { results, errors } = calculate(data, completeProgram);

  it('must load program in memory and have no errors', () => {
    strictEqual(Object.keys(results).length, 7 + 2);
    strictEqual(errors.length, 0);
  });

  it('must compare results with expected outputs', () => {

    {
      const [acc0, type, val] = results['max: {s>0}'];

      strictEqual(type, "index");
      strictEqual(val, 4);
      strictEqual(acc0.length, 5);
      strictEqual(acc0[val][0], 999);
    }

    {
      const [acc0, type, val] = results['min: {s>0}'];

      strictEqual(type, "index");
      strictEqual(val, 0);
      strictEqual(acc0.length, 5);
      strictEqual(acc0[val][0], 600);
    }

    {
      const [acc0, type, val] = results['median: {s>0, d=value1}'];

      strictEqual(type, "value");
      strictEqual(val, 800);
      strictEqual(acc0.length, 5);
    }

    {
      const [acc0, type, val] = results['tuple: sum: {s < max value of #90}'];

      strictEqual(type, "tuple");
      strictEqual(val, NaN);
      strictEqual(acc0.length, 4);

      strictEqual(acc0[0].value, 600);
      strictEqual(acc0[1].value, 700 + 600);
      strictEqual(acc0[2].value, 800 + 700 + 600);
      strictEqual(acc0[3].value, 900 + 800 + 700 + 600);
    }

    {
      const [acc0, type, val] = results['midrange: set #93'];

      strictEqual(type, "value");
      strictEqual(val, (600 + (900 + 800 + 700 + 600)) / 2);
      strictEqual(acc0.length, 4);
    }

    {
      const [acc0, type, val] = results['udf(-1): {s=max value of #90}'];

      strictEqual(type, "tuple");
      strictEqual(val, NaN);
      strictEqual(acc0.length, 1);
      strictEqual(acc0[0][0], -999); // udf doesn't have tuple, must use array index
    }

  });
});

describe('start an interpreter with a query builder', () => {
  const data = [1, 2, 3, 4, 5].map(s => {
    return { a: 'something', b: '', c: '', d: new Date(), s };
  });

  const program = [
    ['{}', null],
    ['{a = something}', 'ref. bb s0'],
    ['{a = something else}', 'ref. cc s0'],
    ['len: {a < must fail}', null],
    ['sum: ref. bb s0', null],
  ].map(([value, ref]) => {
    return { value, ref };
  });

  const { results, errors } = calculate(data, program);

  it('must run a program with a query builder attached', () => {

    strictEqual(Object.keys(results).length, 5 + 2); // 5 lines of program loaded in memory
    strictEqual(errors.length, 1);

    {
      const [acc0, type, val] = results['{}'];

      strictEqual(type, "tuple");
      strictEqual(val, NaN);
      strictEqual(acc0.length, 0);
    }

    {
      const [acc0, type, val] = results['{a = something}'];

      strictEqual(type, "tuple");
      strictEqual(val, NaN);
      strictEqual(acc0.length, 5);
      strictEqual(acc0[0].value, 1);
      strictEqual(acc0[1].value, 2);
      strictEqual(acc0[2].value, 3);
      strictEqual(acc0[3].value, 4);
      strictEqual(acc0[4].value, 5);
    }

    {
      const [acc0, type, val] = results['{a = something else}'];

      strictEqual(type, "tuple");
      strictEqual(val, NaN);
      strictEqual(acc0.length, 0);
    }

    {
      const [acc0, type, val] = results['len: {a < must fail}'];

      strictEqual(type, "tuple");
      strictEqual(val, NaN);
      strictEqual(acc0.length, 0);
    }

    {
      const [acc0, type, val] = results['sum: ref. bb s0'];

      strictEqual(type, "index");
      strictEqual(val, 4);
      strictEqual(acc0.length, 5);
      strictEqual(acc0[val].value, 1 + 2 + 3 + 4 + 5);
    }
  });

});