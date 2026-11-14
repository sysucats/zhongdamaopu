// 一次性导入：5 档材质 + 25 枚成就徽章（含正面图上传、背面/3D 生成、序列号准备）
// 部署：EMAS 控制台上传本目录 zip 建函数 importBadges
// 调用：{ apply:false } 预览 → { apply:true } 导入 → { apply:true, stage:'assets' } 续作 → { apply:true, stage:'activate' } 上线
const COS = require('cos-nodejs-sdk-v5');
const { generateAssets } = require('./achievementBack.js');
const serials = require('./achievementSerial.js');
const { MATERIALS, BADGES } = require('./data.js');

const counter = (list, fn) => list.filter(fn).length;

async function findAll(collection, query = {}) {
  const { result: total } = await collection.count(query);
  const rows = [];
  while (rows.length < total) {
    const { result } = await collection.find(query, { skip: rows.length, limit: 100 });
    if (!result || !result.length) break;
    rows.push(...result);
  }
  return rows;
}

function cosClient(secret) {
  const region = secret.OSS_ENDPOINT && secret.OSS_ENDPOINT.match(/^cos\.([^.]+)\.myqcloud\.com$/)?.[1];
  if (!region) throw new Error('COS 地域配置无效');
  return {
    cos: new COS({ SecretId: secret.OSS_SECRET_ID, SecretKey: secret.OSS_SECRET_KEY }),
    region,
    bucket: secret.OSS_BUCKET,
    origin: `https://${secret.OSS_BUCKET}.${secret.OSS_ENDPOINT}/`,
  };
}

function putObject(client, key, body) {
  return new Promise((resolve, reject) => {
    client.cos.putObject({
      Bucket: client.bucket, Region: client.region, Key: key, Body: body, ContentType: 'image/png',
    }, (error, data) => error ? reject(error) : resolve(data));
  });
}

async function withRetry(fn, times = 3) {
  let last;
  for (let i = 0; i < times; i++) {
    try { return await fn(); } catch (error) { last = error; await new Promise(r => setTimeout(r, 300)); }
  }
  throw last;
}

const norm = s => String(s || '').trim();

// 材质认领：key 精确命中 > 名称精确/包含 > 名称带 v1~v5 序号（前端手工上传的命名习惯）
function matchMaterial(item, index, materials, used) {
  const byKey = materials.find(m => m.key === item.key);
  if (byKey) return { current: byKey, how: 'key' };
  const cand = materials.filter(m => {
    if (used.has(m._id)) return false;
    const name = norm(m.name);
    if (name === item.name) return true;
    if (name.includes(item.name)) return true;
    const seq = name.match(/^v(\d+)[-_\s]*/i);
    return !!(seq && Number(seq[1]) === index + 1);
  });
  return cand.length ? { current: cand[0], how: 'name' } : { current: null, how: null };
}

// 徽章认领：key 精确命中 > 同系列同名（手工新建的等价条目）
function matchBadge(item, badges, used) {
  const byKey = badges.find(b => b.key === item.key);
  if (byKey) return { current: byKey, how: 'key' };
  const cand = badges.find(b => !used.has(b._id) && norm(b.series) === norm(item.series) && norm(b.name) === norm(item.name));
  return cand ? { current: cand, how: 'name' } : { current: null, how: null };
}

module.exports = async (ctx) => {
  const args = ctx.args || {};
  const db = ctx.mpserverless.db;
  const apply = args.apply === true;
  const stage = args.stage || 'all';
  const limit = Math.max(1, Math.min(25, Number(args.limit) || 25));
  const wantActive = args.status === 'active';

  const materials = await findAll(db.collection('achievement_material'));
  const badges = await findAll(db.collection('achievement_def'));

  // 认领计划：已有记录优先复用，避免手工上传的材质/徽章被重复新建
  const usedMat = new Set();
  const matPlan = MATERIALS.map((item, i) => ({ item, ...matchMaterial(item, i, materials, usedMat) }));
  matPlan.filter(p => p.current).forEach(p => usedMat.add(p.current._id));
  const usedBadge = new Set();
  const badgePlan = BADGES.map(item => ({ item, ...matchBadge(item, badges, usedBadge) }));
  badgePlan.filter(p => p.current).forEach(p => usedBadge.add(p.current._id));
  for (const p of badgePlan) {
    if (!p.current) { p.holders = 0; continue; }
    p.holders = (await db.collection('achievement').count({ key: p.current.key })).result || 0;
    p.locked = p.current.status === 'active' || p.holders > 0;
  }
  const matRenames = matPlan.filter(p => p.current && p.current.key !== p.item.key);

  if (!apply) {
    return {
      ok: true, preview: true,
      counts: { material: materials.length, badge: badges.length },
      materials: {
        existing: materials.map(m => ({ key: m.key, name: m.name, image: m.image || '' })),
        willCreate: matPlan.filter(p => !p.current).map(p => `${p.item.key}/${p.item.name}`),
        willAdopt: matPlan.filter(p => p.current).map(p => ({
          existing: `${p.current.key}/${p.current.name}`,
          as: `${p.item.key}/${p.item.name}`,
          renameKey: p.current.key !== p.item.key,
        })),
        unmatched: materials.filter(m => !usedMat.has(m._id)).map(m => `${m.key}/${m.name}`),
      },
      badges: {
        existing: badges.map(b => ({ key: b.key, series: b.series, name: b.name, status: b.status, hasBack: !!b.backImage })),
        willCreate: badgePlan.filter(p => !p.current).length,
        willAdopt: badgePlan.filter(p => p.current && !p.locked).map(p => ({
          existing: `${p.current.key}/${p.current.series}/${p.current.name}`,
          as: `${p.item.key}/${p.item.name}`,
          renameKey: p.current.key !== p.item.key,
        })),
        locked: badgePlan.filter(p => p.locked).map(p => `${p.current.key}/${p.item.name}(holders=${p.holders},status=${p.current.status})`),
      },
      hint: '确认无误后传 { "apply": true } 执行导入',
    };
  }

  const { result: secret } = await db.collection('app_secret').findOne();
  if (!secret?.OSS_BUCKET || !secret?.OSS_ENDPOINT || !secret?.OSS_SECRET_ID || !secret?.OSS_SECRET_KEY) {
    return { ok: false, error: 'app_secret 缺少 OSS 配置' };
  }
  const client = cosClient(secret);
  const report = { materials: [], badges: [], renames: [], assets: { done: 0, failed: [], skipped: 0 }, activate: null };

  // 1. 材质：上传 + 认领（复用已有 _id，key 归一到规范值）
  if (stage === 'all' || stage === 'materials') {
    for (const { item, current, how } of matPlan) {
      const path = `achievement/materials/${item.key}.png`;
      await withRetry(() => putObject(client, path, Buffer.from(item.b64, 'base64')));
      const image = client.origin + path;
      const data = { key: item.key, name: item.name, image, updated_at: new Date() };
      if (current) await db.collection('achievement_material').updateOne({ _id: current._id }, { $set: data });
      else await db.collection('achievement_material').insertOne({ ...data, created_at: new Date() });
      report.materials.push({
        key: item.key, name: item.name, image,
        action: current ? (current.key === item.key ? 'updated' : 'adopted') : 'created',
        adoptedFrom: current ? `${current.key}/${current.name}` : undefined,
        matchedBy: how,
      });
      // 旧 key 被改写的，同步已在用的徽章引用，避免指向不存在的材质
      if (current && current.key !== item.key) {
        const refs = (await findAll(db.collection('achievement_def'), { materialKey: current.key }));
        for (const ref of refs) {
          await db.collection('achievement_def').updateOne({ _id: ref._id }, { $set: { materialKey: item.key } });
        }
        report.renames.push({ from: current.key, to: item.key, badgeRefs: refs.length });
      }
    }
  }

  // 2. 徽章：上传正面 + 认领（有持有者或已上线的只跳过规则改写）
  if (stage === 'all' || stage === 'badges') {
    for (const { item, current, locked, holders } of badgePlan) {
      if (locked) {
        report.badges.push({ key: item.key, action: 'skipped-locked', existingKey: current.key, holders, status: current.status });
        continue;
      }
      const path = `achievement/fronts/${item.key}.png`;
      await withRetry(() => putObject(client, path, Buffer.from(item.b64, 'base64')));
      const frontImage = client.origin + path;
      const data = {
        key: item.key, series: item.series, name: item.name, sort: item.sort,
        status: 'draft', rule: { ...item.rule }, materialKey: item.materialKey, frontImage,
        description: '', updated_at: new Date(),
      };
      if (current) {
        await db.collection('achievement_def').updateOne({ _id: current._id }, { $set: data });
      } else {
        await db.collection('achievement_def').insertOne({
          ...data, backImage: '', backMaterialImage: '', model3dUrl: '', created_at: new Date(),
        });
      }
      report.badges.push({
        key: item.key, action: current ? (current.key === item.key ? 'updated' : 'adopted') : 'created',
        adoptedFrom: current ? current.key : undefined,
      });
    }
  }

  // 3. 背面 + 3D 素材（按 limit 分批，幂等：已就绪的跳过）
  if (stage === 'all' || stage === 'assets') {
    const matByKey2 = new Map((await findAll(db.collection('achievement_material'))).map(m => [m.key, m]));
    const rows = await findAll(db.collection('achievement_def'));
    const targets = [];
    for (const item of BADGES) {
      const row = rows.find(r => r.key === item.key);
      if (!row) continue;
      const material = matByKey2.get(row.materialKey);
      if (!row.frontImage || !material?.image) continue;
      const ready = row.backImage && row.model3dUrl && row.backMaterialImage === material.image;
      if (ready) { report.assets.skipped++; continue; }
      targets.push({ row, material });
    }
    for (const { row, material } of targets.slice(0, limit)) {
      try {
        const assets = await generateAssets(ctx, row.frontImage, material.image, row.key);
        await db.collection('achievement_def').updateOne({ _id: row._id }, {
          $set: { ...assets, backMaterialImage: material.image, updated_at: new Date() },
        });
        report.assets.done++;
      } catch (error) {
        report.assets.failed.push({ key: row.key, error: error.message });
      }
    }
    report.assets.remaining = Math.max(0, targets.length - limit);
    report.assets.hasMore = targets.length > limit;
  }

  // 4. 序列号准备 + 可选上线
  if (stage === 'activate' || (stage === 'all' && !report.assets.hasMore)) {
    const rows = await findAll(db.collection('achievement_def'));
    const serialPending = [];
    for (const item of BADGES) {
      const row = rows.find(r => r.key === item.key);
      if (!row) continue;
      const { pending } = await serials.prepare(db, row.key);
      if (pending) serialPending.push(row.key);
      if ((stage === 'activate' || wantActive) && row.frontImage && row.backImage && row.status !== 'active') {
        await db.collection('achievement_def').updateOne({ _id: row._id }, { $set: { status: 'active', updated_at: new Date() } });
      }
    }
    report.activate = { serialPending, done: true };
  }

  return {
    ok: true,
    apply: true,
    stage,
    summary: {
      materials: counter(report.materials, m => ['created', 'updated', 'adopted'].includes(m.action)),
      badges: counter(report.badges, b => ['created', 'updated', 'adopted'].includes(b.action)),
      badgesSkipped: counter(report.badges, b => b.action === 'skipped-locked'),
      assetsDone: report.assets.done,
      assetsFailed: report.assets.failed.length,
      assetsRemaining: report.assets.remaining || 0,
    },
    assets: report.assets,
    activate: report.activate,
    report,
  };
};
