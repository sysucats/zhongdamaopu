// 上传载荷检查：确认猫咪档案 JSON 里的字段适配正确（不改数据库、不改其它代码）
// 用法（仓库根目录）：node wb_code/meowid-payload-check.mjs
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { catPayload } = require(resolve(process.cwd(), 'functionsEMAS/unionOp/meowidSync.js'));

const cases = [
  { title: '标准新猫（布尔字段齐全）', cat: { _id: 'cat_a', name: '大橘', gender: '公', colour: '橘',
    campus: '南校园', area: '北门花坛', birthday: '2023-01-01', character: '亲人',
    adopt: 1, sterilized: true, missing: false, to_star: false } },
  { title: '历史数据：adopt 是字符串、绝育在 neutered', cat: { _id: 'cat_b', name: '三花',
    adopt: '1', neutered: true } },
  { title: '失踪 / 回喵星', cat: { _id: 'cat_c', name: '小黑', adopt: '0', sterilized: false,
    missing: true, to_star: false } },
  { title: '字段缺失且空串', cat: { _id: 'cat_d', name: '', area: '', adopt: '', sterilized: null } },
  { title: '无名字', cat: { _id: 'cat_e', name: undefined } },
];

let bad = 0;
const check = (ok, label) => { if (!ok) { bad++; console.log('  ✗ ' + label); } };

for (const { title, cat } of cases) {
  const { data, fingerprint } = catPayload(cat);
  console.log('\n' + title);
  console.log(JSON.stringify(data));
  console.log('  指纹 ' + fingerprint.slice(0, 16));
  if (data.metadata.local_id !== cat._id) check(false, 'local_id 应等于 cat._id');
  if ('adopt' in data.metadata) check(Number.isInteger(data.metadata.adopt), 'adopt 必须是整数');
  if ('neutered' in data.metadata) check(typeof data.metadata.neutered === 'boolean', 'neutered 必须是布尔');
  for (const key of Object.keys(data.metadata)) {
    check(data.metadata[key] !== '' && data.metadata[key] !== null, key + ' 不应上传空值');
  }
}

// 指纹必须只由载荷内容决定：同样内容两次计算结果一致，改一个字段就变
const a = catPayload({ _id: 'x', name: 'n', adopt: 1 });
const b = catPayload({ _id: 'x', name: 'n', adopt: '1' });
const c = catPayload({ _id: 'x', name: 'n', adopt: 2 });
console.log('');
check(a.fingerprint === b.fingerprint, "adopt 1 和 '1' 归一后指纹应一致");
check(a.fingerprint !== c.fingerprint, 'adopt 变化后指纹应改变');
check(catPayload({ _id: 'x', name: 'n', sterilized: true }).fingerprint
  === catPayload({ _id: 'x', name: 'n', neutered: true }).fingerprint, 'sterilized / neutered 应等价');

console.log(bad ? `\n${bad} 项不通过` : '\n全部通过');
process.exit(bad ? 1 : 0);
