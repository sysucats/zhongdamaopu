// 一次性云函数：把成就编号计数器从 setting 迁到 achievement_serial，并清理 setting 中的成就旧文档。
// 模式：preview（默认，只读）→ migrate（写新集合）→ cleanup（删 setting 旧文档）。
const SERIAL_PREFIX = 'achievement_serial:';
const ASSETS_PREFIX = 'achievement_assets:';
const LEASE_VERSION = 2;
const CONFIRM = { migrate: 'MIGRATE_ACHIEVEMENT_SERIAL', cleanup: 'CLEAN_ACHIEVEMENT_SETTING' };

async function scan(collection, query = {}) {
  const rows = [];
  for (;;) {
    const { result } = await collection.find(query, { skip: rows.length, limit: 100 });
    rows.push(...(result || []));
    if (!result || result.length < 100) return rows;
  }
}

// 汇总每枚徽章的旧计数、新计数与已发最大编号。
async function snapshot(db) {
  const [legacy, assets, current, highest, unnumbered] = await Promise.all([
    scan(db.collection('setting'), { _id: { $regex: `^${SERIAL_PREFIX}` } }),
    scan(db.collection('setting'), { _id: { $regex: `^${ASSETS_PREFIX}` } }),
    scan(db.collection('achievement_serial')),
    db.collection('achievement').aggregate([
      { $match: { serialNo: { $gt: 0 } } },
      { $group: { _id: '$key', max: { $max: '$serialNo' } } },
    ]),
    db.collection('achievement').aggregate([
      { $match: { $or: [{ serialNo: { $exists: false } }, { serialNo: null }, { serialNo: { $lte: 0 } }] } },
      { $group: { _id: '$key' } },
    ]),
  ]);
  const unnumberedKeys = new Set((unnumbered.result || []).map(row => row._id));
  const maxByKey = new Map((highest.result || []).map(row => [row._id, row.max]));
  const currentByKey = new Map(current.map(row => [row._id, row]));
  const serials = legacy.map(doc => {
    const key = doc._id.slice(SERIAL_PREFIX.length);
    const next = currentByKey.get(key);
    const target = Math.max(doc.seq || 0, maxByKey.get(key) || 0);
    return {
      key, legacyId: doc._id, legacySeq: doc.seq || 0, legacyReady: !!doc.ready,
      maxIssued: maxByKey.get(key) || 0, target,
      newSeq: next ? next.seq : null,
      // 旧档已就绪且该徽章没有缺号记录时，新档也应就绪。
      readyNow: !!doc.ready && !unnumberedKeys.has(key),
      needsReady: !!doc.ready && !unnumberedKeys.has(key) && !!next && !next.ready,
      safeToDelete: !!next && next.seq >= target && (!doc.ready || unnumberedKeys.has(key) || !!next.ready),
    };
  });
  return { serials, assets: assets.map(doc => doc._id), currentCount: current.length };
}

function summary(snap) {
  return {
    legacySerialDocs: snap.serials.length,
    pendingMigrate: snap.serials.filter(item => item.newSeq === null || item.newSeq < item.target || item.needsReady).length,
    unsafeToDelete: snap.serials.filter(item => !item.safeToDelete).map(item => item.key),
    legacyAssetDocs: snap.assets.length,
    newSerialDocs: snap.currentCount,
  };
}

async function migrate(db, snap) {
  const counters = db.collection('achievement_serial');
  const results = await Promise.allSettled(snap.serials.map(async item => {
    if (item.newSeq === null) {
      await counters.updateOne({ _id: item.key }, {
        $setOnInsert: { seq: item.target, ready: item.readyNow, leaseVersion: LEASE_VERSION },
      }, { upsert: true });
      return 'created';
    }
    // 新版云函数已先建档（从已发最大编号续号）：只抬高 seq、补 ready，从不调低。
    // 以当前 seq 为条件，避免覆盖线上刚发出的号；被并发推进则下次预览再看。
    const set = {};
    if (item.newSeq < item.target) set.seq = item.target;
    if (item.needsReady) set.ready = true;
    if (!Object.keys(set).length) return 'kept';
    await counters.updateOne({ _id: item.key, seq: item.newSeq }, { $set: set });
    return 'updated';
  }));
  const count = status => results.filter(r => r.status === 'fulfilled' && r.value === status).length;
  const failed = results.map((r, i) => r.status === 'rejected' ? { key: snap.serials[i].key, error: String(r.reason?.message || r.reason) } : null).filter(Boolean);
  return { created: count('created'), updated: count('updated'), kept: count('kept'), failed };
}

async function cleanup(db, snap) {
  const setting = db.collection('setting');
  const ids = [...snap.serials.filter(item => item.safeToDelete).map(item => item.legacyId), ...snap.assets];
  const results = await Promise.allSettled(ids.map(_id => setting.deleteOne({ _id })));
  return {
    deleted: results.filter(r => r.status === 'fulfilled').length,
    failed: ids.filter((_, i) => results[i].status === 'rejected'),
    skipped: snap.serials.filter(item => !item.safeToDelete).map(item => item.key),
  };
}

module.exports = async ctx => {
  const args = ctx.args || {};
  const db = ctx.mpserverless.db;
  const { result: secretDoc } = await db.collection('app_secret').findOne();
  if (!secretDoc?.IMPORT_KEY) return { success: false, error: '当前服务空间的 app_secret 未配置 IMPORT_KEY' };
  // 统一转字符串、去首尾空白再比；报错只说明原因，不回显密钥
  if (args.secret === undefined || args.secret === null || String(args.secret).trim() === '') {
    return { success: false, error: '缺少 secret 参数：请传入 app_secret.IMPORT_KEY 的实际值（不是占位符）' };
  }
  if (/^<.*>$/.test(String(args.secret).trim())) {
    return { success: false, error: 'secret 还是占位符：请把 <IMPORT_KEY> 换成 app_secret 集合里 IMPORT_KEY 字段的实际值' };
  }
  if (String(args.secret).trim() !== String(secretDoc.IMPORT_KEY).trim()) {
    const typeHint = typeof args.secret !== typeof secretDoc.IMPORT_KEY
      ? `（类型不同：传入 ${typeof args.secret}，库里 ${typeof secretDoc.IMPORT_KEY}）` : '';
    return { success: false, error: `secret 与 app_secret.IMPORT_KEY 不一致${typeHint}` };
  }
  const mode = args.mode || 'preview';
  if (!['preview', 'migrate', 'cleanup'].includes(mode)) return { success: false, error: '未知模式' };
  if (mode !== 'preview' && args.confirm !== CONFIRM[mode]) return { success: false, error: '缺少写入确认' };

  try {
    const snap = await snapshot(db);
    if (mode === 'preview') return { success: true, mode, ...summary(snap), serials: snap.serials };
    const result = mode === 'migrate' ? await migrate(db, snap) : await cleanup(db, snap);
    return { success: true, mode, ...result, after: summary(await snapshot(db)) };
  } catch (error) {
    return { success: false, mode, error: String(error?.message || error) };
  }
};
