#!/usr/bin/env node
/**
 * fixScatteredColors.mjs — 把 PR 新增的硬编码颜色归一到 app.wxss token。
 * 只替换 git diff 中 PR 新增的行，不碰历史行，避免扩大 diff。
 * 用法：node wb_code/fixScatteredColors.mjs [baseRef]（默认 master...HEAD）
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cd = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' });

// 通用替换（顺序敏感：先 background-color 再 background 再裸 color）
const COMMON = [
  [/background-color: #fff;/g, 'background-color: var(--color-surface);'],
  [/background: #fff;/g, 'background: var(--color-surface);'],
  [/color: #fff;/g, 'color: var(--color-text-inverse);'],
  [/solid #fff;/g, 'solid var(--color-surface);'],
  [/color: #ffffff;/g, 'color: var(--color-text-inverse);'],
  [/color: #333;/g, 'color: var(--color-text-onPrimary);'],
];

// 按文件附加替换
const PER_FILE = {
  'components/newsModal/newsModal.wxss': [
    [/ #d5d5d6/g, ' var(--color-divider)'],
  ],
  'components/medicalRecords/medicalRecords.wxss': [
    [/background: #787aff;/g, 'background: var(--color-edit);'],
  ],
  'pages/manage/filters/filters.wxss': [
    [/background: #e74c3c;/g, 'background: var(--color-filter-accent);'],
    [/background: #e0e0e0;/g, 'background: var(--color-divider);'],
  ],
  'components/relationTab/relationTab.wxss': [
    [/color: #a855f7;/g, 'color: var(--color-tag-purple);'],
    [/background: #eff6ff;/g, 'background: var(--color-tag-blue-bg);'],
    [/color: #3b82f6;/g, 'color: var(--color-tag-blue);'],
    [/background: #fdf2f8;/g, 'background: var(--color-tag-pink-bg);'],
    [/color: #ec4899;/g, 'color: var(--color-tag-pink);'],
    [/background: #f3f4f6;/g, 'background: var(--color-tag-gray-bg);'],
    [/color: #9ca3af;/g, 'color: var(--color-tag-gray);'],
    [/background: #f3e8ff;/g, 'background: var(--color-tag-purple-bg);'],
  ],
  'pages/genealogy/detailCat/relationGraph/relationGraph.wxss': [
    [/--blue: #a2d2ff;/g, '--blue: var(--color-graph-node-blue);'],
    [/--pink: #ffc8dd;/g, '--pink: var(--color-graph-node-pink);'],
    [/--mainNode: #ffb347; \/\* var\(--color-primary\) \*\//g, '--mainNode: var(--color-graph-node-main);'],
    [/background: #f5f5f5;/g, 'background: var(--color-gray-light);'],
    [/dashed #ccc;/g, 'dashed var(--color-graph-line);'],
    [/1rpx solid #fff0d6;/g, '1rpx solid var(--color-graph-node-border);'],
  ],
  'components/achievementUnlock/achievementUnlock.wxss': [
    [/#fff0b9/g, 'var(--color-achievement-glow-inner)'],
    [/#fff8e5/g, 'var(--color-achievement-glow-outer)'],
  ],
  'pages/genealogy/detailCat/detailCat.wxss': [
    [/background-color: #fffdf7;/g, 'background-color: var(--color-primary-bg);'],
  ],
  'pages/leaderboard/leaderboard.wxss': [
    [/#fbf7f0/g, 'var(--color-warm-bg)'],
    [/#fff 72%/g, 'var(--color-surface) 72%'],
  ],
  'pages/map/map.wxss': [
    [/var\(--color-primary, #ffd101\)/g, 'var(--color-primary)'],
    [/var\(--color-primary-light, #fffced\)/g, 'var(--color-primary-light)'],
    [/var\(--color-gray-light, #f7f7f7\)/g, 'var(--color-gray-light)'],
    [/var\(--color-gray-max, #888\)/g, 'var(--color-gray-max)'],
  ],
};

// 解析 diff 新增行号集合
function addedLines(file) {
  const diff = cd(`git diff -U0 master...HEAD -- "${file}"`);
  const lines = new Set();
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = +m[1];
    const count = m[2] === undefined ? 1 : +m[2];
    for (let i = 0; i < count; i++) lines.add(start + i);
  }
  return lines;
}

const files = cd('git diff master...HEAD --name-only -- "*.wxss"')
  .trim().split('\n')
  .filter(f => f !== 'miniprogram/app.wxss');

let total = 0;
for (const file of files) {
  const key = file.replace(/^miniprogram\//, '');
  if (!PER_FILE[key] && !file.endsWith('.wxss')) continue;
  const targets = addedLines(file);
  if (!targets.size) continue;
  const path = join(ROOT, file);
  const src = readFileSync(path, 'utf8').split('\n');
  const rules = [...COMMON, ...(PER_FILE[key] || [])];
  let changed = 0;
  src.forEach((line, idx) => {
    if (!targets.has(idx + 1)) return;
    for (const [re, rep] of rules) {
      re.lastIndex = 0; // /g 正则 test 有状态，必须重置
      if (re.test(line)) {
        line = line.replace(new RegExp(re.source, 'g'), rep);
        changed++;
        break; // 一行只套用一条规则，避免链式误替换
      }
    }
    src[idx] = line;
  });
  if (changed) {
    writeFileSync(path, src.join('\n'));
    console.log(`${changed}\t${file}`);
    total += changed;
  }
}
console.log(`---\nreplaced lines: ${total}`);
