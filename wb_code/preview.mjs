// 命令行预览小程序（等价开发者工具「预览」），云端编译后落地二维码 PNG 供扫码
// 用法: node wb_code/preview.mjs [pagePath] [searchQuery]
// 私钥: 环境变量 MP_PRIVATE_KEY_PATH，缺省用仓库根目录 private.<appid>.key
import ci from 'miniprogram-ci';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { appid } = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
const privateKeyPath = process.env.MP_PRIVATE_KEY_PATH || path.join(ROOT, `private.${appid}.key`);
const dest = path.join(ROOT, 'preview-qrcode.png');

if (!fs.existsSync(privateKeyPath)) {
  console.error(`[error] 未找到上传密钥: ${privateKeyPath}`);
  console.error('  小程序后台 → 开发管理 → 开发设置 → 小程序代码上传 → 生成并下载密钥');
  console.error(`  下载后放到仓库根目录 private.${appid}.key，或用 MP_PRIVATE_KEY_PATH 指定路径`);
  process.exit(1);
}

const [pagePath, searchQuery] = process.argv.slice(2);

const project = new ci.Project({
  appid,
  type: 'miniProgram',
  projectPath: ROOT,
  privateKeyPath,
  ignores: [
    'node_modules/**/*',
    'functionsEMAS/**/*',
    'wb_code/**/*',
    'initDatabase/**/*',
    'initStorage/**/*',
    'readme/**/*',
    '.git/**/*',
    'preview-qrcode.png',
  ],
});

const start = Date.now();
const res = await ci.preview({
  project,
  desc: `CI 预览 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  // 走 project.config.json 的编译设置（含 minified:true），与开发者工具上传口径一致；
  // 手动 minify:false 会因源码体积超 2048KB 被微信拒绝（crypto-js 等未压缩源码）。
  setting: { useProjectConfig: true },
  qrcodeFormat: 'image',
  qrcodeOutputDest: dest,
  ...(pagePath ? { pagePath } : {}),
  ...(searchQuery ? { searchQuery } : {}),
  onProgressUpdate: (t) => {
    process.stdout.write(`\r[${t._msg || ''}] ${t._status === 'done' ? 100 : t._progress || 0}%    `);
  },
});

console.log(`\n编译通过，耗时 ${((Date.now() - start) / 1000).toFixed(1)}s`);
console.log(`二维码: ${dest}`);
for (const p of res?.subPackageInfo || []) {
  console.log(`包 ${p.name || 'main'}: ${(p.size / 1024 / 1024).toFixed(2)} MB / ${p.packNum} 文件`);
}
