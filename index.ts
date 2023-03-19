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

import { Accumulator, QueryBuilder, Solution, Tokens, Tuple } from "abstract";

interface Point {
  readonly a: string;
  readonly b: string;
  readonly c: string;
  readonly d: Date;
  readonly s: number;
}

type Indexes = Set<number>;

function fold(this: Point[], acc: Indexes, [xs, op]: [Indexes, string], i: number) {
  if (i === 0) {
    if (op === Tokens.CLUSTER_OP_DIFFS) {
      return new Set<number>(this.map((_, i) => i).filter(i => !xs.has(i)));
    }

    return xs;
  }

  switch (op) {
    case Tokens.CLUSTER_OP_DIFFS:
      xs.forEach(i => acc.delete(i));
      break;
    case Tokens.CLUSTER_OP_INNER:
      const acc0 = new Set<number>();
      acc.forEach(i => xs.has(i) && acc0.add(i));
      acc = acc0;
      break;
    case Tokens.CLUSTER_OP_UNION:
      xs.forEach(i => acc.add(i));
      break;
  }

  return acc;
}

type Constant<T, K> = [T, K, K | undefined];

const Wildcard = '*';

function compareText(str: string): (s: string) => boolean {
  const union = str.split('|').map(each => {
    const str = each.trim();

    const [constant, nth] = str[0] === '"' && str[str.length - 1] === '"'
      ? [str.slice(1, str.length - 1), false]
      : [str, true]; // enable search over all tokens

    const pred = constant.startsWith(Wildcard)
      ? (s: string) => s.endsWith(constant.replace(Wildcard, ''))
      : constant.endsWith(Wildcard)
        ? (s: string) => s.startsWith(constant.replace(Wildcard, ''))
        : (s: string) => s === constant;

    return (text: string) => pred(text) || (nth && text.split(/\s+/g).some(pred));
  });

  return (text: string) => union.some(p => p(text) === true);
}

enum DateHeader {
  FULL_DATE, // yyyy-mm-dd
  ENTIRE_MONTH, // yyyy-mm
  ENTIRE_YEAR, // yyyy
  MONTH,
  MONTH_DAY,
  WEEK_DAY // e.g. third day of the week
}

function parseDateConstant(constant: string): Constant<DateHeader, number> {
  if (/^\d{4}\-\d{2}\-\d{2}$/.test(constant)) {
    return [DateHeader.FULL_DATE, new Date(constant).getTime(), undefined];
  }
  // year & month e.g. 2023-01
  if (/^\d{4}\-\d{2}$/.test(constant)) {
    const startValue = new Date(constant);
    const closeValue = startValue.getMonth() < 12
      ? Date.UTC(startValue.getFullYear(), startValue.getMonth() + 1, 1) // first of next month
      : Date.UTC(startValue.getFullYear() + 1, 0, 1); // first of first month next year

    return [DateHeader.ENTIRE_MONTH, startValue.getTime(), closeValue];
  }
  // only year e.g. 2023
  if (/^\d{4}$/.test(constant)) {
    const startValue = new Date(constant);
    const closeValue = Date.UTC(startValue.getFullYear() + 1, 0, 1); // first day of next year

    return [DateHeader.ENTIRE_YEAR, startValue.getTime(), closeValue];
  }
  // month as number e.g. 12
  if (/^#1?[0-9]$/.test(constant)) {
    const month = constant.replace(/\D/g, '');

    return [DateHeader.MONTH, Number(month) - 1, undefined]; // js months start at zero
  }
  // day of month e.g. 23'
  if (/^#[123]?[0-9]\'$/.test(constant)) {
    const dayOfMonth = constant.replace(/\D/g, '');

    return [DateHeader.MONTH_DAY, Number(dayOfMonth), undefined];
  }
  // day of week e.g. 3"
  if (/^#[1-7]\"$/.test(constant)) {
    const dayOfWeek = constant.replace(/\D/g, '');

    return [DateHeader.WEEK_DAY, Number(dayOfWeek) - 1, undefined]; // js weekdays start at zero 
  }

  throw new Error(`incorrect constant (d) "${constant}"`);
}

function isDateEqual(ctx: Constant<DateHeader, number>): (d: Date) => boolean {
  const [type, value0, value1] = ctx;

  switch (type) {
    case DateHeader.ENTIRE_MONTH:
      return d => value0 <= d.getTime() && d.getTime() < (value1 as number);
    case DateHeader.ENTIRE_YEAR:
      return d => value0 <= d.getTime() && d.getTime() < (value1 as number);
    case DateHeader.FULL_DATE:
      return d => d.getTime() === value0;
    case DateHeader.MONTH:
      return d => d.getMonth() === value0;
    case DateHeader.MONTH_DAY:
      return d => d.getDate() === value0;
    case DateHeader.WEEK_DAY:
      return d => d.getDay() === value0;
    default:
      return _ => false;
  }
}

function isDateAfter(ctx: Constant<DateHeader, number>): (d: Date) => boolean {
  const [type, value0, value1] = ctx;

  switch (type) {
    case DateHeader.ENTIRE_MONTH:
      return d => d.getTime() >= (value1 as number); // closing date is first of next month
    case DateHeader.ENTIRE_YEAR:
      return d => d.getTime() >= (value1 as number); // closing date is first of new year
    case DateHeader.FULL_DATE:
      return d => d.getTime() > value0;
    case DateHeader.MONTH:
      return d => d.getMonth() > value0;
    case DateHeader.MONTH_DAY:
      return d => d.getDate() > value0;
    case DateHeader.WEEK_DAY:
      return d => d.getDay() > value0;
    default:
      return _ => false;
  }
}

function isDateBefore(ctx: Constant<DateHeader, number>): (d: Date) => boolean {
  const [type, value0, _] = ctx;

  switch (type) {
    case DateHeader.ENTIRE_MONTH:
      return d => d.getTime() < value0;
    case DateHeader.ENTIRE_YEAR:
      return d => d.getTime() < value0;
    case DateHeader.FULL_DATE:
      return d => d.getTime() < value0;
    case DateHeader.MONTH:
      return d => d.getMonth() < value0;
    case DateHeader.MONTH_DAY:
      return d => d.getDate() < value0;
    case DateHeader.WEEK_DAY:
      return d => d.getDay() < value0;
    default:
      return _ => false;
  }
}

class Sum {
  public static exponent = 2;
  public static currency = 'RON';
}

enum SumHeader {
  NUMERIC_FLAT,
  NUMERIC_ISO_4217, // has currency suffix
}

function parseSumConstant(constant: string): Constant<SumHeader, number> {
  if (/^-?\d+$/.test(constant)) {
    return [SumHeader.NUMERIC_FLAT, Number(constant), undefined];
  }

  if (/^\d{1,3}(\s?\d{3})*(\.\d{1,2})?\s*[A-Z]{3}$/.test(constant)) {
    constant = constant.replace(/[^\-\d\.]/g, '');

    if (constant.indexOf('.') > -1) {
      const numValue = Number(constant.replace('.', ''));

      return [SumHeader.NUMERIC_ISO_4217, numValue, numValue];
    }

    const startValue = Number(constant + ''.padEnd(Sum.exponent, '0'));
    const closeValue = Number(constant + ''.padEnd(Sum.exponent, '9'));

    return [SumHeader.NUMERIC_ISO_4217, startValue, closeValue];
  }

  throw new Error(`incorrect constant (s) "${constant}"`);
}

function isSumEqual(ctx: Constant<SumHeader, number>): (n: number) => boolean {
  const [type, value0, value1] = ctx;

  switch (type) {
    case SumHeader.NUMERIC_FLAT:
      return n => n === value0;
    case SumHeader.NUMERIC_ISO_4217:
      return n => value0 <= n && n <= (value1 as number);
    default:
      return _ => false;
  }
}

function isSumLessThan(ctx: Constant<SumHeader, number>): (n: number) => boolean {
  const [type, value0, _] = ctx;

  switch (type) {
    case SumHeader.NUMERIC_FLAT:
      return n => n < value0;
    case SumHeader.NUMERIC_ISO_4217:
      return n => n < value0;
    default:
      return _ => false;
  }
}

function isSumMoreThan(ctx: Constant<SumHeader, number>): (n: number) => boolean {
  const [type, value0, value1] = ctx;

  switch (type) {
    case SumHeader.NUMERIC_FLAT:
      return n => n > value0;
    case SumHeader.NUMERIC_ISO_4217:
      return n => n > (value1 as number);
    default:
      return _ => false;
  }
}

function isEqualToHeaderA(constant: string) {
  const pred = compareText(constant);

  return ({ a }: Point) => pred(a) === true;
}

function isNotEqualToHeaderA(constant: string) {
  const pred = compareText(constant);

  return ({ a }: Point) => pred(a) !== true;
}

function isEqualToHeaderB(constant: string) {
  const pred = compareText(constant);

  return ({ b }: Point) => pred(b) === true;
}

function isNotEqualToHeaderB(constant: string) {
  const pred = compareText(constant);

  return ({ b }: Point) => pred(b) !== true;
}

function isEqualToHeaderC(constant: string) {
  const pred = compareText(constant);

  return ({ c }: Point) => pred(c) === true;
}

function isNotEqualToHeaderC(constant: string) {
  const pred = compareText(constant);

  return ({ c }: Point) => pred(c) !== true;
}

function isEqualToHeaderD(constant: string) {
  const pred = isDateEqual(parseDateConstant(constant));

  return ({ d }: Point) => pred(d) === true;
}

function isNotEqualToHeaderD(constant: string) {
  const pred = isDateEqual(parseDateConstant(constant));

  return ({ d }: Point) => pred(d) !== true;
}

function isGreaterThanHeaderD(constant: string) {
  const pred = isDateBefore(parseDateConstant(constant));

  return ({ d }: Point) => pred(d) === true;
}

function isGreaterThanOrEqualToHeaderD(constant: string) {
  const equal = isDateEqual(parseDateConstant(constant));
  const before = isDateBefore(parseDateConstant(constant));

  return ({ d }: Point) => before(d) || equal(d);
}

function isLessThanHeaderD(constant: string) {
  const pred = isDateAfter(parseDateConstant(constant));

  return ({ d }: Point) => pred(d) === true;
}

function isLessThanOrEqualToHeaderD(constant: string) {
  const equal = isDateEqual(parseDateConstant(constant));
  const after = isDateAfter(parseDateConstant(constant));

  return ({ d }: Point) => after(d) || equal(d);
}

function isEqualToHeaderS(constant: string) {
  const pred = isSumEqual(parseSumConstant(constant));

  return ({ s }: Point) => pred(s) === true;
}

function isNotEqualToHeaderS(constant: string) {
  const pred = isSumEqual(parseSumConstant(constant));

  return ({ s }: Point) => pred(s) !== true;
}

function isGreaterThanHeaderS(constant: string) {
  const pred = isSumLessThan(parseSumConstant(constant));

  return ({ s }: Point) => pred(s) === true;
}

function isGreaterThanOrEqualToHeaderS(constant: string) {
  const equal = isSumEqual(parseSumConstant(constant));
  const lessThan = isSumLessThan(parseSumConstant(constant));

  return ({ s }: Point) => lessThan(s) || equal(s);
}

function isLessThanHeaderS(constant: string) {
  const pred = isSumMoreThan(parseSumConstant(constant));

  return ({ s }: Point) => pred(s) === true;
}

function isLessThanOrEqualToHeaderS(constant: string) {
  const equal = isSumEqual(parseSumConstant(constant));
  const moreThan = isSumMoreThan(parseSumConstant(constant));

  return ({ s }: Point) => moreThan(s) || equal(s);
}

const $ = new QueryBuilder<Point>();

$.register({
  header: "a", clauses: {
    '=': isEqualToHeaderA,
    '≠': isNotEqualToHeaderA,
  }
});

$.register({
  header: "b", clauses: {
    '=': isEqualToHeaderB,
    '≠': isNotEqualToHeaderB,
  }
});

$.register({
  header: "c", clauses: {
    '=': isEqualToHeaderC,
    '≠': isNotEqualToHeaderC,
  }
});

$.register({
  header: "d", clauses: {
    '=': isEqualToHeaderD,
    '≠': isNotEqualToHeaderD,
    '>': isLessThanHeaderD,
    '≥': isLessThanOrEqualToHeaderD,
    '<': isGreaterThanHeaderD,
    '≤': isGreaterThanOrEqualToHeaderD,
  }
});

$.register({
  header: "s", clauses: {
    '=': isEqualToHeaderS,
    '≠': isNotEqualToHeaderS,
    '>': isLessThanHeaderS,
    '≥': isLessThanOrEqualToHeaderS,
    '<': isGreaterThanHeaderS,
    '≤': isGreaterThanOrEqualToHeaderS,
  }
});

function createQuery(this: Point[], expr: string): Indexes {
  const findings: Record<string, [Set<number>, string]> = {};

  for (const { sign, test, text } of $.scan(expr)) {
    const matches = new Set<number>();
    findings[text] = [matches, sign];

    for (let i = 0; i < this.length; i++)
      test.every(p => p(this[i]) === true) && matches.add(i);
  }

  return Object.values(findings).reduce(fold.bind(this), new Set as Indexes);
}

function index(ds: Point[], input: string) {
  const filter = createQuery.bind(ds);

  const data = input === "{...}"
    ? ds.map(({ s }, i) => new Tuple(s, i))
    : Array.from(filter(input)).map(i => new Tuple(ds[i].s, i));

  // TODO: should spawn multiple child-dedicated workers 
  //       if ds length exceeds "decent" sizes e.g. mln?
  return [data, "tuple", NaN] as Accumulator;
}

export { index, Point, Sum };

function byValue(a: Tuple, b: Tuple) {
  return a.value - b.value;
}

type NumericFunction = (a: Accumulator) => Accumulator;

function avg([ds, ,]: Accumulator): Accumulator {
  const xs = [...ds];

  return [xs, Solution.VALUE, xs.reduce((p, a) => p + a.value, 0) / xs.length];
}

function len([ds, ,]: Accumulator): Accumulator {
  return [ds, Solution.VALUE, ds.length];
}

function max([ds, ,]: Accumulator): Accumulator {
  const xs = [...ds].sort(byValue);

  return [xs, Solution.INDEX, xs.length - 1];
}

function median([ds, ,]: Accumulator): Accumulator {
  const xs = [...ds].sort(byValue);

  const idx = Math.floor(xs.length / 2);
  const out = xs.length % 2
    ? xs[idx].value
    : (xs[idx - 1].value + xs[idx].value) / 2;

  return [xs, Solution.VALUE, xs.length > 0 ? out : NaN];
}

function midrange([ds, ,]: Accumulator): Accumulator {
  const xs = [...ds].sort(byValue);
  const value = xs.length > 0
    ? (xs[xs.length - 1].value + xs[0].value) / 2
    : NaN;

  return [xs, Solution.VALUE, value];
}

function min([ds, ,]: Accumulator): Accumulator {
  const xs = [...ds].sort(byValue);

  return [xs, Solution.INDEX, 0];
}

function mode([ds, ,]: Accumulator): Accumulator {
  const xs = [] as Tuple[];

  const counter: Record<number, number[]> = {};
  ds.forEach(({ index, value }) => {
    counter[value] = value in counter ? [...counter[value], index] : [index];
  });

  const kv = Object.entries(counter);
  kv.sort(([, a], [, b]) => a.length - b.length);
  kv.forEach(([s, is]) => {
    is.forEach(index => xs.push(new Tuple(+s, index)));
  });

  return [xs, Solution.VALUE, xs.length > 0 ? xs[0].value : NaN];
}

function range([ds, ,]: Accumulator): Accumulator {
  const xs = [...ds].sort(byValue);
  const value = xs.length > 0
    ? xs[xs.length - 1].value - xs[0].value
    : NaN;

  return [xs, Solution.VALUE, value];
}

function sum([ds, ,]: Accumulator): Accumulator {
  const xs = [] as Tuple[];
  ds.forEach(({ index, value }) => {
    if (xs.length === 0) xs.push(new Tuple(value, index));
    else xs.push(new Tuple(value + xs[xs.length - 1].value, index));
  });

  return [xs, Solution.INDEX, xs.length - 1];
}

function tuple([ds, ,]: Accumulator): Accumulator {
  return [ds, Solution.TUPLE, NaN];
}

const builtins: Record<string, NumericFunction> = {
  avg,
  len,
  max,
  median,
  midrange,
  min,
  mode,
  range,
  sum,
  tuple, // cast an accumulator from previous solution to tuple
};

export { builtins, NumericFunction };

/******************************* experimental *********************************/

function compile(this: Record<string, string>, func: string): NumericFunction {
  const fun = new FunctionDefinition(func);

  return function udf(this: Point[], [xs, ,]: Accumulator): Accumulator {
    return [xs.map(([x, i]) => fun.resolve(this[i], x, i)), Solution.TUPLE, NaN];
  }
}

enum FunctionDefinitionTokens {
  END_OF_DEFINITION = ";",
  END_OF_CLAUSE = ",",
  PERCENTAGE = "%",
  FACTORIAL = "!",
}

class FunctionDefinition {
  public readonly fn: Record<string, string[]>;

  public constructor(fd: string) {
    this.fn = fd
      .split(FunctionDefinitionTokens.END_OF_DEFINITION)
      .map(a => a.trim().split(FunctionDefinitionTokens.END_OF_CLAUSE))
      .reduce((p, [a, ...b]) => ({ ...p, [a]: b }), {} as Record<string, string[]>);
  }

  public resolve(point: Point, value: number, index: number) {
    for (const [def, clauses] of Object.entries(this.fn)) {
      const ok = clauses.every(a => $.parse(a)(point) === true);
      // TODO: ensure that at least one clause matches
      if (ok) {
        value = this.calculateNewValue(def, point, value);
        break;
      }
    }

    return new Tuple(value, index);
  }

  public calculateNewValue(def: string, { s }: Point, x: number): number {
    const steps = [
      this.replaceFactorial,
      this.replacePercentage,
      (def: string) => def.replace(/s/g, s.toString()),
      (def: string) => def.replace(/x/g, x.toString()),
    ];

    const udf = new Function(`return ${steps.reduce((x, f) => f(x), def)};`);

    return udf();
  }

  protected replacePercentage(def: string) {
    const percs = def.match(/(\d+%)/g);

    if (percs !== null) {
      for (let i = 0; i < percs.length; i++) {
        const perc = +percs[i].replace(FunctionDefinitionTokens.PERCENTAGE, "") / 100;
        def = def.replace(percs[i], perc.toFixed(2));
      }
    }

    return def;
  }

  protected replaceFactorial(def: string) {
    const facts = def.match(/(\d+!)/g);

    if (facts !== null) {
      const factorial = (n: number): number => n > 1 ? n * factorial(n - 1) : n;
      for (let i = 0; i < facts.length; i++) {
        const fact = +facts[i].replace(FunctionDefinitionTokens.FACTORIAL, "");
        def = def.replace(facts[i], factorial(fact).toString());
      }
    }

    return def;
  }
}

export { compile };