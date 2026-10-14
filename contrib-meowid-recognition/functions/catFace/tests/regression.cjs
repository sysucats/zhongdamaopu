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

function setup(payload, status = 200, manager = true, secretExtra = {}, logRec = null, catDoc = null, photoDocs = []) {
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
        // photo 的查询必须真的按条件过滤，否则「只用精选」「没有精选」这类用例测不出来
        const matchPhoto = (p, q) => {
          if (!q) return true;
          if (q.verified === true && !p.verified) return false;
          if (q.best === true && !p.best) return false;
          if (q.cat_id !== undefined && p.cat_id !== undefined && p.cat_id !== q.cat_id) return false;
          if (q._id && q._id.$in && q._id.$in.indexOf(p._id) < 0) return false;
          return true;
        };
      return {
        async findOne(query) {
          reads.push({ name, query });
          if (name === 'app_secret') return { result: Object.assign({ MEOWID_PROJECT_ID: 'test-project', MEOWID_API_KEY: 'test-only', MEOWID_THRESHOLD: 0.35 }, secretExtra) };
          // manager 传布尔值时按 99 / 0 处理；传数字时按该等级（用于验证 Level-99 门槛）
          if (name === 'user') return { result: { manager: query.openid === 'test-user' ? (typeof manager === 'number' ? manager : (manager ? 99 : 0)) : 0 } };
          if (name === 'recognition_log') return { result: logRec };
          if (name === 'cat') return { result: catDoc };
          return { result: null };
        },
        async find(query) {
          reads.push({ name, query });
          if (name === 'photo') return { result: photoDocs.filter((p) => matchPhoto(p, query)) };
          if (name !== 'cat') throw new Error('Unexpected collection: ' + name);
          return { result: catDoc ? [catDoc] : [{ _id: 'local-orange', name: '橘猫', meowid_id: 'meow-orange' }] };
        },
        async count(query) {
          // 只实现 photo 的计数，用来验证「照片池」统计（过审数 / 精选数）
          if (name !== 'photo') return { result: 0 };
          return { result: photoDocs.filter((p) => matchPhoto(p, query)).length };
        },
        async findOneAndUpdate(query, update) { writes.push({ name, query, update }); return { result: {} }; },
        async updateOne(query, update) { writes.push({ name, query, update }); return { result: {} }; },
      };
    } } },
  };
  return { invoke: () => module.exports(ctx), ctx, writes, requests, reads, internals: module.exports.__internals };
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
      for (const action of ['status', 'search', 'quota', 'grantBonus', 'grantTestQuota', 'enrollBatch', 'syncTasks', 'retryTask', 'catImages', 'bind', 'unbind', 'saveConfig', 'diagnose', 'enrollCat']) {
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
      for (const action of ['grantTestQuota', 'enrollBatch', 'syncTasks', 'retryTask', 'catImages', 'bind', 'unbind', 'saveConfig', 'diagnose', 'enrollCat']) {
        const s = setup(hit, 200, false);
        s.ctx.args = { action, openid: 'forged-admin', cat_id: 'local-orange', meowid_id: 'meow-orange', data: {} };
        const res = await s.invoke();
        assert.equal(res.ok, false, action);
        assert.equal(s.reads.find(r => r.name === 'user').query.openid, 'test-user');
        assert.equal(s.writes.length, 0);
        assert.equal(s.requests.length, 0);
      }
    }],
    ['低于 Level-99 的管理员（如 50 级）不能执行任何管理操作', async () => {
      for (const action of ['grantTestQuota', 'enrollBatch', 'syncTasks', 'retryTask', 'catImages', 'bind', 'unbind', 'saveConfig', 'diagnose', 'enrollCat']) {
        const s = setup(hit, 200, 50);
        s.ctx.args = { action, openid: 'test-user', cat_id: 'local-orange', meowid_id: 'meow-orange', data: {} };
        const res = await s.invoke();
        assert.equal(res.ok, false, action + ' 应被拒');
        assert.equal(s.requests.length, 0, action + ' 不应发出第三方请求');
        assert.equal(s.writes.length, 0, action + ' 不应写库');
      }
    }],
    ['广告奖励默认关闭时不发放额度', async () => {
      const s = setup(hit, 200, false);
      s.ctx.args = { action: 'grantBonus' };
      const res = await s.invoke();
      assert.equal(res.code, 'bonus_not_supported');
      assert.equal(s.writes.length, 0);
      assert.equal(s.requests.length, 0);
    }],
    ['开启广告奖励后发放额度并计入当日广告次数', async () => {
      const s = setup(hit, 200, false, { RECOGNIZE_AD_ENABLED: '1', RECOGNIZE_AD_BONUS: '2' });
      s.ctx.args = { action: 'grantBonus' };
      const res = await s.invoke();
      assert.equal(res.ok, true);
      assert.equal(res.bonus, 2);
      const w = s.writes.find(x => x.name === 'recognition_log');
      assert.ok(w, '应写入 recognition_log');
      assert.equal(w.update.$inc.bonus, 2);
      assert.equal(w.update.$inc.adCount, 1);
      assert.equal(s.requests.length, 0);
    }],
    ['广告奖励达到每日上限后拒绝发放', async () => {
      const s = setup(hit, 200, false, { RECOGNIZE_AD_ENABLED: '1' }, { openid: 'test-user', used: 5, bonus: 6, adCount: 3 });
      s.ctx.args = { action: 'grantBonus' };
      const res = await s.invoke();
      assert.equal(res.ok, false);
      assert.equal(res.code, 'bonus_exhausted');
      assert.equal(s.writes.length, 0);
    }],
    ['重试失败任务会打到官方 retry 路径并把本地状态改回排队', async () => {
      const catDoc = {
        _id: 'local-orange', name: '橘猫', meowid_id: 'meow-orange',
        meowid_images: [
          { photo_id: 'p1', task_id: 'task-1', status: 'failed' },
          { photo_id: 'p2', task_id: 'task-2', status: 'completed' },
        ],
      };
      const s = setup({}, 202, true, {}, null, catDoc);
      s.ctx.args = { action: 'retryTask', openid: 'test-user', cat_id: 'local-orange' };
      const res = await s.invoke();
      assert.equal(res.ok, true);
      // 只有 failed 的那条会被重试
      assert.equal(res.total, 1);
      assert.equal(res.retried, 1);
      assert.equal(res.failed, 0);
      const req = s.requests[0];
      assert.equal(req.options.method, 'POST');
      assert.ok(req.options.path.includes('/tasks/task-1/retry'), req.options.path);
      // 官方接口无请求体，必须显式声明长度 0，否则可能被网关拒掉
      assert.equal(Number(req.options.headers['Content-Length']), 0);
      const w = s.writes.find((x) => x.name === 'cat' && x.update.$set && x.update.$set.meowid_images);
      assert.ok(w, '应回写本地登记状态');
      assert.equal(w.update.$set.meowid_images[0].status, 'queued');
      assert.equal(w.update.$set.meowid_images[1].status, 'completed');
    }],
    ['重试时上游报错不会误报成功', async () => {
      const catDoc = { _id: 'local-orange', meowid_id: 'meow-orange', meowid_images: [{ photo_id: 'p1', task_id: 'task-1', status: 'failed' }] };
      const s = setup({ detail: 'not retryable' }, 409, true, {}, null, catDoc);
      s.ctx.args = { action: 'retryTask', openid: 'test-user', cat_id: 'local-orange' };
      const res = await s.invoke();
      assert.equal(res.ok, true);
      assert.equal(res.retried, 0);
      assert.equal(res.failed, 1);
      assert.equal(res.results[0].code, 'meowid_409');
      // 失败不能把状态改掉
      assert.equal(s.writes.length, 0);
    }],
    ['查看建档参考图返回远端数量与本地可预览地址', async () => {
      const catDoc = {
        _id: 'local-orange', name: '橘猫', meowid_id: 'meow-orange',
        meowid_images: [
          { photo_id: 'p1', task_id: 'task-1', status: 'completed' },
          { photo_id: 'p2', task_id: 'task-2', status: 'failed' },
        ],
      };
      const photoDocs = [
        { _id: 'p1', photo_compressed: 'https://x.myqcloud.com/c1.jpg', photo_id: 'https://x.myqcloud.com/o1.jpg', verified: true, best: true },
        { _id: 'p2', photo_compressed: 'https://x.myqcloud.com/c2.jpg', photo_id: 'https://x.myqcloud.com/o2.jpg', verified: true },
      ];
      const s = setup({}, 200, true, {}, null, catDoc, photoDocs);
      s.ctx.args = { action: 'catImages', openid: 'test-user', cat_id: 'local-orange' };
      const res = await s.invoke();
      assert.equal(res.ok, true);
      assert.equal(res.meowid_id, 'meow-orange');
      assert.equal(res.remoteCount, 1);
      assert.equal(res.counts.done, 1);
      assert.equal(res.counts.failed, 1);
      // 默认用压缩图建档，预览地址必须和上传时用的那一版一致
      assert.equal(res.local[0].url, 'https://x.myqcloud.com/c1.jpg');
      assert.equal(res.local[0].best, true);
      // 只读，不能写任何数据
      assert.equal(s.writes.length, 0);
    }],
    ['未绑定个体时查看参考图会给出照片池提示（建档失败时最需要看的信息）', async () => {
      const photoDocs = [
        { _id: 'p1', verified: true, best: false },
        { _id: 'p2', verified: true, best: false },
      ];
      const s = setup({}, 200, true, {}, null, { _id: 'local-x', name: '小花', meowid_id: '' }, photoDocs);
      s.ctx.args = { action: 'catImages', openid: 'test-user', cat_id: 'local-x' };
      const res = await s.invoke();
      assert.equal(res.ok, true);
      assert.equal(res.meowid_id, '');
      assert.equal(res.pool.verified, 2);
      assert.equal(res.pool.best, 0);
      assert.equal(res.pool.onlyBest, true);
      assert.ok(res.pool.hint.indexOf('精选') >= 0, res.pool.hint);
      assert.equal(s.requests.length, 0);
    }],
    ['建档默认只用精选照片，并逐张写回登记记录', async () => {
      const catDoc = { _id: 'local-orange', name: '橘猫', meowid_id: 'meow-orange' };
      const photoDocs = [
        { _id: 'p1', photo_compressed: 'https://x.myqcloud.com/c1.jpg?v=2', verified: true, best: true },
        { _id: 'p2', photo_compressed: 'https://x.myqcloud.com/c2.jpg', verified: true, best: false },
      ];
      const s = setup({}, 200, true, {
        OSS_BUCKET: 'b', OSS_SECRET_ID: 'sid', OSS_SECRET_KEY: 'skey',
        OSS_ENDPOINT: 'https://cos.ap-nanjing.myqcloud.com',
      }, null, catDoc, photoDocs);
      s.ctx.args = { action: 'enrollBatch', openid: 'test-user', limit: 1 };
      const res = await s.invoke();
      assert.equal(res.ok, true);
      // 选图必须带 best: true（默认只用精选）
      const photoRead = s.reads.find((r) => r.name === 'photo' && r.query && r.query.best === true);
      assert.ok(photoRead, '默认必须只查精选照片');
      // 精选只有 1 张，就只该传 1 张
      const uploads = s.requests.filter((r) => r.options.path.endsWith('/images'));
      assert.equal(uploads.length, 1);
      // 逐张写回：不能只在循环结束后写一次，否则超时就全丢
      const histWrites = s.writes.filter((w) => w.name === 'cat' && w.update.$set && w.update.$set.meowid_images);
      assert.ok(histWrites.length >= 1, '必须逐张写回 meowid_images');
      const last = histWrites[histWrites.length - 1].update.$set.meowid_images;
      assert.equal(last.length, 1);
      assert.equal(last[0].photo_id, 'p1');
      assert.equal(last[0].status, 'queued');
      assert.equal(res.uploadedPhotos, 1);
    }],
    ['没有精选照片时建档明确报错，不会静默什么都不做', async () => {
      const catDoc = { _id: 'local-orange', name: '橘猫', meowid_id: 'meow-orange' };
      const photoDocs = [
        { _id: 'p1', photo_compressed: 'https://x.myqcloud.com/c1.jpg', verified: true, best: false },
      ];
      const s = setup({}, 200, true, {
        OSS_BUCKET: 'b', OSS_SECRET_ID: 'sid', OSS_SECRET_KEY: 'skey',
      }, null, catDoc, photoDocs);
      s.ctx.args = { action: 'enrollBatch', openid: 'test-user', limit: 1 };
      const res = await s.invoke();
      assert.equal(res.ok, true);
      assert.equal(res.failed, 1);
      assert.equal(res.done, 0);
      assert.equal(res.logs[0].code, 'no_photo');
      assert.ok(res.logs[0].msg.indexOf('精选') >= 0, res.logs[0].msg);
      assert.ok(res.hint.indexOf('精选') >= 0, res.hint);
      assert.equal(s.requests.filter((r) => r.options.path.endsWith('/images')).length, 0);
    }],
    ['COS 取图：签名后的地址必须去掉查询串，且已签名地址不重复签名', async () => {
      const s = setup(hit);
      const internals = s.internals;
      assert.ok(internals, '应导出 __internals 便于单测');
      const cos = { secretId: 'AKID', secretKey: 'SECRET' };
      const signed = internals.cosSignIfNeeded('https://b.cos.ap-nanjing.myqcloud.com/a/b.jpg?v=2', cos, 600);
      // 请求地址必须与签名内容一致：带 ?v=2 会导致 COS 校验失败
      assert.equal(signed.url, 'https://b.cos.ap-nanjing.myqcloud.com/a/b.jpg');
      assert.ok(signed.headers.Authorization && signed.headers.Authorization.indexOf('q-signature=') > 0);
      // 已经是签名过的地址（带 q-signature）原样返回，避免二次签名 403
      const already = 'https://b.cos.ap-nanjing.myqcloud.com/a/b.jpg?q-signature=abc';
      const out2 = internals.cosSignIfNeeded(already, cos, 600);
      assert.equal(out2.url, already);
      assert.equal(Object.keys(out2.headers).length, 0);
      // 非 COS 地址原样返回
      const out3 = internals.cosSignIfNeeded('https://example.com/x.jpg', cos, 600);
      assert.equal(out3.url, 'https://example.com/x.jpg');
    }],
    ['建档硬保护：最坏耗时塞不进硬截止前就不开工（防 FunctionTimeout）', async () => {
      const s = setup(hit);
      const it = s.internals;
      // EMAS 客户端调用硬上限 60s：所有预算必须留出余量，否则必被平台强杀
      assert.equal(it.CLIENT_REQUEST_HARD_LIMIT_MS, 60000, '客户端硬上限应为 60s');
      assert.ok(it.RECOGNIZE_TIMEOUT_MS < it.CLIENT_REQUEST_HARD_LIMIT_MS, '识别超时须 < 60s');
      assert.ok(it.ENROLL_HARD_DEADLINE_MS < it.CLIENT_REQUEST_HARD_LIMIT_MS, '硬截止须 < 60s');
      assert.ok(it.ENROLL_HARD_DEADLINE_MS <= 58000, '硬截止还要给鉴权/落库留 2s 以上余量');
      // 剩余时间足够「下载 + 上传」→ 允许开工
      assert.equal(it.canAffordOp(0, it.ENROLL_HARD_DEADLINE_MS, it.PHOTO_DOWNLOAD_TIMEOUT_MS + it.WRITE_TIMEOUT_MS), true);
      // 剩余时间不够 → 必须收手（旧版就是在这里硬撑，被 EMAS 强杀成 FunctionTimeout）
      assert.equal(it.canAffordOp(30000, it.ENROLL_HARD_DEADLINE_MS, it.PHOTO_DOWNLOAD_TIMEOUT_MS + it.WRITE_TIMEOUT_MS), false);
      // 单独一步上传也要过闸
      assert.equal(it.canAffordOp(40000, it.ENROLL_HARD_DEADLINE_MS, it.WRITE_TIMEOUT_MS), false);
      // 未传硬截止时（兼容旧调用）默认放行
      assert.equal(it.canAffordOp(0, null, 999999), true);
    }],
    ['已建档的猫可以补传注册图：跳过已登记的、只传新增的、不新建个体', async () => {
      const catDoc = {
        _id: 'local-orange', name: '橘猫', meowid_id: 'meow-orange',
        meowid_images: [{ photo_id: 'p1', task_id: 't1', status: 'queued' }],
      };
      const photoDocs = [
        { _id: 'p1', photo_compressed: 'https://x.myqcloud.com/c1.jpg', verified: true, best: true },
        { _id: 'p2', photo_compressed: 'https://x.myqcloud.com/c2.jpg', verified: true, best: true },
      ];
      const s = setup({}, 200, true, {
        OSS_BUCKET: 'b', OSS_SECRET_ID: 'sid', OSS_SECRET_KEY: 'skey',
      }, null, catDoc, photoDocs);
      s.ctx.args = { action: 'enrollCat', openid: 'test-user', cat_id: 'local-orange' };
      const res = await s.invoke();
      assert.equal(res.ok, true);
      assert.equal(res.dryRun, false);
      // 已登记 p1 → 只该传 p2
      assert.deepEqual(res.preview.pending, ['p2']);
      assert.equal(res.preview.alreadyRegistered, 1);
      assert.equal(res.preview.bound, true);
      const uploads = s.requests.filter((r) => r.options.path.endsWith('/images'));
      assert.equal(uploads.length, 1);
      // 已绑定 → 绝不能再建一个个体（否则平台出现重复个体）
      assert.equal(s.requests.filter((r) => r.options.path.endsWith('/cats')).length, 0);
      assert.equal(res.uploadedPhotos, 1);
    }],
    ['补传预览（dry_run）不建个体、不上传、不写库', async () => {
      const catDoc = { _id: 'local-orange', name: '橘猫', meowid_id: '' };
      const photoDocs = [
        { _id: 'p1', photo_compressed: 'https://x.myqcloud.com/c1.jpg', verified: true, best: true },
        { _id: 'p2', photo_compressed: 'https://x.myqcloud.com/c2.jpg', verified: true, best: true },
      ];
      const s = setup({}, 200, true, {
        OSS_BUCKET: 'b', OSS_SECRET_ID: 'sid', OSS_SECRET_KEY: 'skey',
      }, null, catDoc, photoDocs);
      s.ctx.args = { action: 'enrollCat', openid: 'test-user', cat_id: 'local-orange', dry_run: true };
      const res = await s.invoke();
      assert.equal(res.ok, true);
      assert.equal(res.dryRun, true);
      assert.equal(res.preview.chosen, 2);
      assert.deepEqual(res.preview.pending, ['p1', 'p2']);
      assert.equal(res.preview.bound, false);
      assert.ok(res.hint.indexOf('创建') >= 0, '未绑定时要提示会新建个体：' + res.hint);
      assert.equal(s.requests.length, 0, '预览不能发任何第三方请求');
      assert.equal(s.writes.length, 0, '预览不能写库');
    }],
    ['补传不带猫 ID 或猫不存在时明确报错，不静默成功', async () => {
      const s1 = setup(hit);
      s1.ctx.args = { action: 'enrollCat', openid: 'test-user' };
      const r1 = await s1.invoke();
      assert.equal(r1.ok, false);
      assert.equal(r1.code, 'no_cat_id');
      assert.equal(s1.requests.length, 0);

      const s2 = setup(hit, 200, true, {}, null, null, []);
      s2.ctx.args = { action: 'enrollCat', openid: 'test-user', cat_id: 'not-exist' };
      const r2 = await s2.invoke();
      assert.equal(r2.ok, false);
      assert.equal(r2.code, 'cat_not_found');
      assert.equal(s2.requests.length, 0);
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
