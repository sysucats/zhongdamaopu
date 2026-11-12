#!/usr/bin/env node
/**
 * normalizeColors.mjs — 把业务 wxss 里散落的裸 hex 归一到 app.wxss token。
 * 全量模式（非 diff）：只做“值完全等价”的替换，不改视觉。
 * 用法：node wb_code/normalizeColors.mjs [--write]
 *   不带 --write 只打印统计。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');
const cd = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' });

const appWxss = readFileSync(join(ROOT, 'miniprogram/app.wxss'), 'utf8');
const TOKENS = new Set([...appWxss.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]));

// 文字色（负向断言排除 background-color / border-color）
const TEXT = [
  [/(?<![-\w])color(\s*:\s*)(?:#fff(?:fff)?|white)\b/gi, 'color$1var(--color-text-inverse)'],
  [/(?<![-\w])color(\s*:\s*)#000(?:000)?\b/gi, 'color$1var(--color-black)'],
  [/(?<![-\w])color(\s*:\s*)#333(?:333)?\b/gi, 'color$1var(--color-text-main)'],
  [/(?<![-\w])color(\s*:\s*)#666(?:666)?\b/gi, 'color$1var(--color-text-secondary)'],
  [/(?<![-\w])color(\s*:\s*)#999(?:999)?\b/gi, 'color$1var(--color-text-muted)'],
  [/(?<![-\w])color(\s*:\s*)#ccc(?:ccc)?\b/gi, 'color$1var(--color-text-placeholder)'],
];

// 背景色
const BG = [
  [/(background(?:-color)?\s*:\s*)(?:#fff(?:fff)?|white)\b/gi, '$1var(--color-surface)'],
  [/(background(?:-color)?\s*:\s*)#f8f8f8\b/gi, '$1var(--color-bg-subtle)'],
  [/(background(?:-color)?\s*:\s*)#f5f5f5\b/gi, '$1var(--color-bg-page)'],
  [/(background(?:-color)?\s*:\s*)#000(?:000)?\b/gi, '$1var(--color-black)'],
  [/(background(?:-color)?\s*:\s*)#ccc(?:ccc)?\b/gi, '$1var(--color-gray-mid)'],
];

// 边框/分隔
const BORDER = [
  [/#e5e5e5\b/gi, 'var(--color-border)'],
  [/(border(?:-[a-z]+)?\s*:[^;]*?)#000(?:000)?\b/gi, '$1var(--color-black)'],
  [/(border(?:-[a-z]+)?\s*:[^;]*?)#ddd(?:ddd)?\b/gi, '$1var(--color-gray)'],
  [/(border(?:-[a-z]+)?\s*:[^;]*?)#ccc(?:ccc)?\b/gi, '$1var(--color-gray-mid)'],
];

const RULES = [...TEXT, ...BG, ...BORDER];

// 去掉值已与 token 不符的兜底值：var(--token, #hex) → var(--token)
const stripStaleFallback = (line) =>
  line.replace(/var\((--[a-z0-9-]+),\s*#[0-9a-fA-F]{3,8}\)/gi,
    (all, name) => (TOKENS.has(name) ? `var(${name})` : all));

const files = cd('git ls-files "miniprogram/**/*.wxss"')
  .trim().split('\n')
  .filter((f) => f !== 'miniprogram/app.wxss' && !f.includes('/packages/weui/'));

let total = 0;
for (const file of files) {
  const path = join(ROOT, file);
  const src = readFileSync(path, 'utf8');
  const before = (src.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
  if (!before) continue;

  const out = src.split('\n').map((line) => {
    let next = stripStaleFallback(line);
    for (const [re, rep] of RULES) next = next.replace(re, rep);
    return next;
  }).join('\n');

  const after = (out.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
  if (out === src) continue;
  total += before - after;
  console.log(`${before} -> ${after}\t${file}`);
  if (WRITE) writeFileSync(path, out);
}
console.log(`---\n${WRITE ? 'replaced' : 'would replace'}: ${total}`);
