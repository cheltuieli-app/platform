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

import { build, createInterpreter } from "abstract";
import * as lang from "language";
import { builtins as bifs, compile, index, NumericFunction, Point } from ".";

function preprocess(content: lang.Content[]) {
  const source: Array<[string, string | undefined]> = [];
  const macro: Record<string, string> = {};

  for (const { def, ref, value } of content) {
    if (def) {
      if (ref) macro[ref] = value;
    } else {
      source.push([value, ref]);
    }
  }

  return { source, macro };
}

function interpret(dataset: Point[], content: lang.Content[]) {
  const { source, macro } = preprocess(content);
  const [program, memory] = build(source, macro);

  const lib: Record<string, NumericFunction> = Object
    .entries(macro)
    .reduce((p, [, v]) => ({ ...p, [v]: compile.call(macro, v) }), bifs);

  const fun = (s: string, i: number) =>
    lib[s] || lib[s.toLowerCase()] || function () {
      throw new Error(`undefined ${s} at ${i}`);
    };

  const interpreter = createInterpreter(
    (token, acc, arg) => acc
      ? fun(token, arg).call(dataset, acc)
      : index(dataset, token));

  program(interpreter);

  const results = Object.fromEntries(memory);
  for (const [src, ref] of source) {
    if (results[src] && ref) results[ref] = results[src];
  }

  return { results, errors: interpreter.errors };
}

export default interpret;