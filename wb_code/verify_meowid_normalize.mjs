// 校验 miniprogram/utils/cloudApi.js#normalizeMeowidResult 对云函数返回值的归一化行为。
// 该函数未导出，这里从源码里按文本截取后执行，保证测的是文件里真实的代码。
// 用法：node wb_code/verify_meowid_normalize.mjs
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'miniprogram/utils/cloudApi.js');

const src = fs.readFileSync(SRC, 'utf8');
const constLine = src.match(/const FUNCTION_OUTDATED_MSG = .*;/)[0];
const start = src.indexOf('function normalizeMeowidResult');
const tail = start < 0 ? '' : src.slice(start);
const close = tail.match(/\r?\n\}\r?\n/); // 函数体最后一行顶格右花括号
const end = close ? start + close.index + close[0].length : -1;
if (start < 0 || end < 0) throw new Error('未能在 cloudApi.js 中定位 normalizeMeowidResult');
const fnSrc = src.slice(start, end);
const normalize = new Function(`${constLine}\n${fnSrc}\nreturn normalizeMeowidResult;`)();

const cases = [
  {
    name: '云端路由层不认识 meowid（裸返回值）',
    input: { errMsg: 'unknown action: meowid', ok: false },
    expect: r => r.ok === false && r.code === 'function_outdated',
  },
  {
    name: '云端路由层不认识 meowid（网关包装）',
    input: { success: true, data: { errMsg: 'unknown action: meowid', ok: false }, header: { 'x-fc-request-id': 'x' } },
    expect: r => r.ok === false && r.code === 'function_outdated',
  },
  {
    name: '其它路由层错误（如 not a manager）',
    input: { errMsg: 'not a manager', ok: false },
    expect: r => r.ok === false && r.code === 'function_error' && r.msg.includes('not a manager'),
  },
  {
    name: '正常业务结果原样透传',
    input: { ok: true, config: { ready: true, topK: 5 } },
    expect: r => r.ok === true && r.config.topK === 5,
  },
  {
    name: '业务错误（带 msg）原样透传',
    input: { ok: false, code: 'bad_signature', msg: '签名无效' },
    expect: r => r.ok === false && r.code === 'bad_signature' && r.msg === '签名无效',
  },
  { name: '空结果', input: null, expect: r => r === null },
];

let failed = 0;
for (const c of cases) {
  const out = normalize(c.input);
  const pass = c.expect(out);
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.name}  ->  ${JSON.stringify(out)}`);
}
console.log(failed ? `\n${failed} 项未通过` : `\n全部 ${cases.length} 项通过`);
process.exit(failed ? 1 : 0);
