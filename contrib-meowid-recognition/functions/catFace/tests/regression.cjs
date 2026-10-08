// 完整云函数回归：模拟 MeowID HTTP 和 EMAS 数据库，不联网、不使用真实密钥。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const target = process.argv[2] || path.join(__dirname, '../index.js');
const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const match = { cat_id: 'meow-orange', cat_name: '橘猫', score: 0.9806, support: 3 };
const hit = { cat_count: 1, route: 'face', face_detected: true, unknown: false, matches: [match], candidates: [] };

function setup(payload, status = 200, manager = true) {
  const writes = [];
  const requests = [];
  const reads = [];
  const mockHttps = {
    request(options, callback) {
      const req = new EventEmitter();
      const chunks = [];
      req.write = (chunk) => chunks.push(Buffer.from(chunk));
      req.destroy = (error) => req.emit('error', error);
      req.end = () => {
        requests.push({ options, body: Buffer.concat(chunks) });
        queueMicrotask(() => {
          const res = new EventEmitter();
          res.statusCode = status;
          res.headers = { 'x-request-id': 'test-request' };
          callback(res);
          let body = payload;
          if (options.path.endsWith('/images')) body = [{ id: 'image-1', vectors_added: 1 }];
          if (options.path.endsWith('/content')) body = image;
          res.emit('data', Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)));
          res.emit('end');
        });
      };
      return req;
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(target, 'utf8'), {
    module, Buffer, URL, setTimeout,
    console: { log() {}, warn() {}, error() {} },
    require: (name) => name === 'https' ? mockHttps : require(name),
  }, { filename: target });
  const ctx = {
    args: { action: 'search', photoBase64: image.toString('base64'), openid: 'test-user' },
    mpserverless: {
      user: { async getInfo() { return { user: { oAuthUserId: 'test-user' } }; } },
      db: { collection(name) {
      return {
        async findOne(query) {
          reads.push({ name, query });
          if (name === 'app_secret') return { result: { MEOWID_PROJECT_ID: 'test-project', MEOWID_API_KEY: 'test-only', MEOWID_THRESHOLD: 0.35 } };
          if (name === 'user') return { result: { manager: manager && query.openid === 'test-user' ? 99 : 0 } };
          return { result: null };
        },
        async find(query) {
          if (name !== 'cat') throw new Error('Unexpected collection: ' + name);
          return { result: [{ _id: 'local-orange', name: '橘猫', meowid_id: 'meow-orange' }] };
        },
        async findOneAndUpdate(query, update) { writes.push({ name, query, update }); return { result: {} }; },
        async updateOne(query, update) { writes.push({ name, query, update }); return { result: {} }; },
      };
    } } },
  };
  return { invoke: () => module.exports(ctx), ctx, writes, requests, reads };
}

async function run() {
  const cases = [
    ['明确命中能映射回本地猫谱、保留分数并只扣一次', async () => {
      const s = setup(hit);
      const res = await s.invoke();
      assert.equal(res.ok, true);
      assert.equal(res.data.catCount, 1);
      assert.equal(res.data.route, 'face');
      assert.equal(res.data.recognizeResults[0].catID, 'local-orange');
      assert.equal(res.data.recognizeResults[0].score, 0.9806);
      assert.equal(res.data.debugHint.rawCatCount, 1);
      assert.equal(res.data.quotaConsumed, true);
      assert.equal(s.writes.length, 1);
      assert.equal(res.quota.left, 2);
      assert.ok(s.requests[0].body.includes(image));
      assert.equal(Number(s.requests[0].options.headers['Content-Length']), s.requests[0].body.length);
    }],
    ['检测到猫但身份未知时仍正确保留候选', async () => {
      const s = setup({ cat_count: 1, route: 'body', unknown: true, matches: [], candidates: [{ index: 0, unknown: true, matches: [match] }] });
      const res = await s.invoke();
      assert.equal(res.data.catCount, 1);
      assert.equal(res.data.unknown, true);
      assert.equal(res.data.recognizeResults[0].catID, 'local-orange');
    }],
    ['无猫响应不扣次数', async () => {
      const s = setup({ cat_count: 0, route: '', unknown: false, matches: [], candidates: [] });
      const res = await s.invoke();
      assert.equal(res.ok, true);
      assert.equal(res.data.catCount, 0);
      assert.equal(res.data.quotaConsumed, false);
      assert.equal(s.writes.length, 0);
      assert.equal(res.quota.left, 3);
    }],
    ['上游 HTTP 错误不会伪装成无猫也不扣次数', async () => {
      const s = setup({ detail: 'upstream down' }, 503);
      const res = await s.invoke();
      assert.equal(res.ok, false);
      assert.equal(res.code, 'meowid_503');
      assert.equal(s.writes.length, 0);
    }],
    ['不完整的成功响应显示服务异常，不误报无猫、不扣次数', async () => {
      for (const payload of [{}, { cat_count: -1 }, { cat_count: '1' }, { cat_count: null }]) {
        const s = setup(payload);
        const res = await s.invoke();
        assert.equal(res.ok, false);
        assert.equal(res.code, 'invalid_response');
        assert.equal(s.writes.length, 0);
      }
    }],
    ['诊断使用同一请求解析路径，能报告真实命中', async () => {
      const s = setup(hit);
      s.ctx.args = { action: 'diagnose', openid: 'test-user', limit: 1 };
      const res = await s.invoke();
      assert.equal(res.ok, true);
      const cat = res.data.perCat[0];
      assert.equal(cat.catCount, 1);
      assert.equal(cat.route, 'face');
      assert.equal(cat.rawCatCount, 1);
      assert.equal(cat.top[0].score, 0.9806);
      assert.equal(cat.jsonCatCount, 1);
      assert.equal(s.writes.length, 0);
    }],
    ['额度只使用平台身份，忽略请求声明的其他用户', async () => {
      const s = setup(hit);
      s.ctx.args.openid = 'forged-user';
      const res = await s.invoke();
      assert.equal(res.ok, true);
      assert.equal(s.writes[0].query.openid, 'test-user');
      assert.ok(s.reads.filter(r => r.name === 'recognition_log').every(r => r.query.openid === 'test-user'));
    }],
    ['支持上游平台身份结构，客户端无需传 openid', async () => {
      for (const info of [
        { user: { oAuthUserId: 'test-user' } },
        { result: { user: { openId: 'test-user' } } },
        { user: { openid: 'test-user' } },
      ]) {
        const s = setup(hit);
        s.ctx.mpserverless.user.getInfo = async () => info;
        s.ctx.args = { action: 'quota' };
        const res = await s.invoke();
        assert.equal(res.ok, true);
        assert.equal(s.reads.find(r => r.name === 'recognition_log').query.openid, 'test-user');
        assert.equal(s.requests.length, 0);
      }
    }],
    ['所有 action 拒绝匿名或缺失平台身份，伪造管理员参数无效', async () => {
      for (const action of ['status', 'search', 'quota', 'grantBonus', 'grantTestQuota', 'enrollBatch', 'syncTasks', 'bind', 'unbind', 'saveConfig', 'diagnose']) {
        const s = setup(hit);
        s.ctx.mpserverless.user.getInfo = async () => ({ user: {} });
        s.ctx.args = { action, openid: 'forged-admin' };
        const res = await s.invoke();
        assert.equal(res.code, 'unauthenticated', action);
        assert.equal(s.reads.length, 0);
        assert.equal(s.writes.length, 0);
        assert.equal(s.requests.length, 0);
      }
    }],
    ['平台身份读取失败重试一次后拒绝调用', async () => {
      const s = setup(hit);
      let attempts = 0;
      s.ctx.mpserverless.user.getInfo = async () => { attempts++; throw new Error('unavailable'); };
      const res = await s.invoke();
      assert.equal(res.code, 'unauthenticated');
      assert.equal(attempts, 2);
      assert.equal(s.reads.length, 0);
      assert.equal(s.requests.length, 0);
      assert.equal(s.writes.length, 0);
    }],
    ['平台身份读取短暂失败后可以正常查询本人额度', async () => {
      const s = setup(hit);
      let attempts = 0;
      s.ctx.mpserverless.user.getInfo = async () => {
        if (++attempts === 1) throw new Error('transient');
        return { user: { oAuthUserId: 'test-user' } };
      };
      s.ctx.args = { action: 'quota' };
      const res = await s.invoke();
      assert.equal(res.ok, true);
      assert.equal(attempts, 2);
      assert.equal(s.reads.find(r => r.name === 'recognition_log').query.openid, 'test-user');
    }],
    ['普通用户无法通过声明管理员 openid 执行管理操作', async () => {
      for (const action of ['grantTestQuota', 'enrollBatch', 'syncTasks', 'bind', 'unbind', 'saveConfig', 'diagnose']) {
        const s = setup(hit, 200, false);
        s.ctx.args = { action, openid: 'forged-admin', cat_id: 'local-orange', meowid_id: 'meow-orange', data: {} };
        const res = await s.invoke();
        assert.equal(res.ok, false, action);
        assert.equal(s.reads.find(r => r.name === 'user').query.openid, 'test-user');
        assert.equal(s.writes.length, 0);
        assert.equal(s.requests.length, 0);
      }
    }],
    ['未接广告服务端验证时奖励入口拒绝发放额度', async () => {
      const s = setup(hit);
      s.ctx.args = { action: 'grantBonus' };
      const res = await s.invoke();
      assert.equal(res.code, 'bonus_not_supported');
      assert.equal(s.writes.length, 0);
      assert.equal(s.requests.length, 0);
      assert.equal(s.reads.length, 0);
    }],
    ['平台身份确认的管理员仍可绑定猫档案', async () => {
      const s = setup(hit);
      s.ctx.args = { action: 'bind', cat_id: 'local-orange', meowid_id: 'meow-orange' };
      const res = await s.invoke();
      assert.equal(res.ok, true);
      assert.equal(s.writes.length, 1);
      assert.equal(s.writes[0].name, 'cat');
      assert.equal(s.writes[0].query._id, 'local-orange');
      assert.equal(s.writes[0].update.$set.meowid_id, 'meow-orange');
      assert.equal(s.requests.length, 0);
    }],
  ];
  let failed = 0;
  for (const [name, test] of cases) {
    try { await test(); console.log('PASS ' + name); }
    catch (error) { failed++; console.log('FAIL ' + name + ': ' + error.message); }
  }
  if (failed) process.exitCode = 1;
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
