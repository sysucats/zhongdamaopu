// 命令行构建小程序 npm（等价于开发者工具「工具 → 构建 npm」）
// 用法: node wb_code/buildNpm.mjs
import ci from 'miniprogram-ci';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { packNpmManually } = ci;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const res = await packNpmManually({
  packageJsonPath: path.join(ROOT, 'miniprogram/package.json'),
  miniprogramNpmDistDir: path.join(ROOT, 'miniprogram'),
});

console.log(`小程序包: ${res.miniProgramPackNum}，其他: ${res.otherNpmPackNum}`);
for (const w of res.warnList) console.warn(`[warn] ${w.msg || w.type || JSON.stringify(w)}`);
