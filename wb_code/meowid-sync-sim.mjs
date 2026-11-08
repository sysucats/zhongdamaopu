// MeowID 同步批次仿真：虚拟时钟 + 内存版 Mongo 查询，跑新旧两版 meowidSync 对比
// 用法（仓库根目录）：node wb_code/meowid-sync-sim.mjs
// 只读取 git HEAD 里的旧实现做对照，不改动任何源文件。
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const require = createRequire(import.meta.url);

// ---------- 虚拟时钟 ----------
const clock = { t: 1_700_000_000_000, advance(ms) { this.t += ms; } };
const realNow = Date.now;
Date.now = () => clock.t;

const OP_MS = 25;          // 一次数据库往返
const CLIENT_MS = 1200;    // 每批之间的客户端往返 / invoke 开销，只算进用户等待时长
const COST = { download: 900, upload: 600, catWrite: 400, tasksRead: 300, request: 250 };

// ---------- 内存 Mongo 子集 ----------
function getPath(doc, path) {
  let cur = doc;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}
function setPath(doc, path, value) {
  const parts = path.split('.');
  let cur = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
function matchField(value, cond) {
  if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)
    && Object.keys(cond).some(k => k[0] === '$')) {
    for (const [op, arg] of Object.entries(cond)) {
      switch (op) {
        case '$exists': if ((value !== undefined) !== !!arg) return false; break;
        case '$ne': if (value === arg) return false; break;
        case '$in': if (!arg.some(v => v === value)) return false; break;
        case '$nin': if (arg.some(v => v === value)) return false; break;
        case '$lte': if (!(value !== undefined && value <= arg)) return false; break;
        case '$lt': if (!(value !== undefined && value < arg)) return false; break;
        case '$gte': if (!(value !== undefined && value >= arg)) return false; break;
        case '$gt': if (!(value !== undefined && value > arg)) return false; break;
        default: throw new Error('未支持的查询操作符 ' + op);
      }
    }
    return true;
  }
  return value === cond;
}
function match(doc, query) {
  for (const [key, cond] of Object.entries(query)) {
    if (key === '$and') { if (!cond.every(q => match(doc, q))) return false; continue; }
    if (key === '$or') { if (!cond.some(q => match(doc, q))) return false; continue; }
    if (!matchField(getPath(doc, key), cond)) return false;
  }
  return true;
}

function createDb(seed) {
  const store = new Map();
  for (const [name, rows] of Object.entries(seed)) store.set(name, rows.map(r => ({ ...r })));
  const stats = { ops: 0 };
  const op = () => { stats.ops++; clock.advance(OP_MS); };
  const coll = name => {
    if (!store.has(name)) store.set(name, []);
    const rows = () => store.get(name);
    return {
      async findOne(query) {
        op();
        return { result: rows().find(d => match(d, query)) || null };
      },
      async find(query, options = {}) {
        op();
        let out = rows().filter(d => match(d, query));
        if (options.sort && options.sort._id) out = out.slice().sort((a, b) => (a._id > b._id ? 1 : a._id < b._id ? -1 : 0));
        if (options.limit) out = out.slice(0, options.limit);
        out = out.map(d => {
          if (!options.projection) return d;
          const picked = { _id: d._id };
          for (const key of Object.keys(options.projection)) if (options.projection[key]) picked[key] = d[key];
          return picked;
        });
        return { result: out };
      },
      async count(query) { op(); return { result: rows().filter(d => match(d, query)).length }; },
      async updateOne(query, update) {
        op();
        const doc = rows().find(d => match(d, query));
        if (!doc) return { result: { affectedDocs: 0 } };
        for (const [k, v] of Object.entries(update.$set || {})) setPath(doc, k, v);
        return { result: { affectedDocs: 1 } };
      },
      async updateMany(query, update) {
        op();
        const docs = rows().filter(d => match(d, query));
        for (const doc of docs) for (const [k, v] of Object.entries(update.$set || {})) setPath(doc, k, v);
        return { result: { affectedDocs: docs.length } };
      },
      async insertOne(doc) { op(); rows().push({ ...doc }); return { result: { affectedDocs: 1 } }; },
    };
  };
  return { mpserverless: { db: { collection: coll } }, _store: store, _stats: stats };
}

// ---------- 假 MeowID ----------
function createApi(cost = {}) {
  const c = { ...COST, ...cost };
  let seq = 0;
  const api = {
    requests: 0,
    async request(config, method, path) {
      api.requests++;
      if (path.includes('/images')) { clock.advance(c.upload); return { body: { task_id: 'task-' + (++seq), id: 'img-' + seq } }; }
      if (method === 'GET' && path.includes('/tasks')) { clock.advance(c.tasksRead); return { body: [] }; }
      clock.advance(c.catWrite);
      if (method === 'POST') return { body: { id: 'remote-' + (++seq) } };
      return { body: {} };
    },
    async download() { api.requests++; clock.advance(c.download); return Buffer.from('fake-image'); },
  };
  return api;
}

// ---------- 数据准备 ----------
function seed(catCount, photosPerCat, legacyImages = 0) {
  const cats = [];
  const photos = [];
  for (let c = 0; c < catCount; c++) {
    const catId = 'cat' + String(c).padStart(3, '0');
    const legacy = [];
    for (let i = 0; i < legacyImages; i++) legacy.push({ image_id: 'legacy-' + catId + '-' + i });
    cats.push({ _id: catId, name: '猫' + c, deleted: 0, campus: '珠海', meowid_images: legacy });
    for (let p = 0; p < photosPerCat; p++) {
      photos.push({ _id: catId + '-p' + String(p).padStart(3, '0'), cat_id: catId, verified: true, photo_compressed: 'https://x/y.jpg' });
    }
  }
  return { cat: cats, photo: photos, setting: [], app_secret: [] };
}

// ---------- 驱动：模拟客户端"syncAll → 反复 syncNext"直到 more=false ----------
async function drive(mod, ctx, makeConfig, options, label) {
  const api = createApi(options.slow);
  let batches = 0, uploaded = 0, timeouts = 0, maxBatch = 0, total = 0, busy = 0;
  const start = clock.t;
  let action = 'syncAll';
  while (batches < 400) {
    const config = makeConfig();
    ctx.args = { action };
    const t0 = clock.t;
    let res;
    try { res = await mod.run(ctx, config, api, options); }
    catch (error) { console.log(label, '抛错', error.message); break; }
    const dur = clock.t - t0;
    total += dur; maxBatch = Math.max(maxBatch, dur); batches++;
    if (dur > 55000) timeouts++;
    if (res.busy) { busy++; break; }
    uploaded += res.processed || 0;
    if (!res.more) break;
    action = 'syncNext';
  }
  const photos = ctx._store.get('photo');
  const byStatus = {};
  for (const p of photos) {
    const s = (p.meowid_sync && p.meowid_sync.status) || '(未同步)';
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  const serverWall = clock.t - start;
  return { label, batches, uploaded, busy, timeouts, maxBatch, serverWall,
    wall: serverWall + batches * CLIENT_MS, byStatus, dbOps: ctx._stats.ops };
}

// ---------- 载入新旧实现 ----------
async function loadNew() {
  return require(join(ROOT, 'functionsEMAS/unionOp/meowidSync.js'));
}
async function loadOld() {
  const dir = mkdtempSync(join(tmpdir(), 'meowid-old-'));
  for (const file of ['meowidSync.js', 'meowidTiming.js']) {
    const code = execSync(`git show HEAD:functionsEMAS/unionOp/${file}`, { cwd: ROOT, encoding: 'utf8' });
    writeFileSync(join(dir, file), code);
  }
  return createRequire(join(dir, 'x.js'))(join(dir, 'meowidSync.js'));
}

const NEW_LIMIT = 45000, OLD_LIMIT = 55000;
// 每次 invoke 都是新的一次调用：预算从"这次进入 handler 的时刻"起算
const mk = limit => () => ({
  projectId: 'proj-1', apiKey: 'k', baseUrl: 'https://platform.meowid.net',
  enrollImagesPerCat: 10, topK: 5, threshold: null, deadline: clock.t + limit,
});

const sec = ms => (Math.round(ms / 100) / 10) + 's';

async function scenario(title, catCount, photosPerCat, opts = {}) {
  const limit = opts.limit || 10;
  const legacy = opts.legacy || 0;
  const oldMod = await loadOld();
  const newMod = await loadNew();
  const fresh = () => seed(catCount, photosPerCat, legacy);

  const mode = { limited: opts.all !== true, slow: opts.slow };
  clock.t = 1_700_000_000_000;
  const oldRun = await drive(oldMod, createDb(fresh()), mk(OLD_LIMIT), mode, '改前');
  clock.t = 1_700_000_000_000;
  const newRun = await drive(newMod, createDb(fresh()), mk(NEW_LIMIT), mode, '改后');

  console.log('\n=== ' + title + `（猫咪 ${catCount} 只 × 照片 ${photosPerCat} 张，上限 ${limit}` +
    (legacy ? `，历史 ${legacy} 条` : '') + '）===');
  console.log(['实现', '批次', '上传', '标记超额', '超时', '单批最长', '用户等待', '均摊', 'DB 请求'].join(' | '));
  for (const r of [oldRun, newRun]) {
    console.log([r.label, r.batches, r.uploaded, r.byStatus.limited || 0, r.timeouts, sec(r.maxBatch),
      sec(r.wall), r.uploaded ? sec(r.wall / r.uploaded) + '/张' : '-', r.dbOps].join(' | '));
  }
  // 数据完整性：两种情况都应把所有照片处理完，剩余候选必须为 0
  for (const r of [oldRun, newRun]) {
    const left = Object.entries(r.byStatus).filter(([k]) => ['retry', 'uncertain', '(未同步)', 'downloading'].includes(k));
    if (left.length) console.log('  ! ' + r.label + ' 仍有未处理照片：' + JSON.stringify(Object.fromEntries(left)));
  }
}

await scenario('按上限同步', 20, 30, { limit: 10 });
await scenario('按上限同步（额度充足）', 5, 6, { limit: 10 });
await scenario('按上限同步（含历史 meowid_images）', 10, 20, { limit: 10, legacy: 5 });
await scenario('全量同步', 20, 30, { limit: 10, all: true });
await scenario('按上限同步（慢速照片：下载 4s + 上传 8s）', 10, 12, { limit: 10, slow: { download: 4000, upload: 8000 } });
Date.now = realNow;
