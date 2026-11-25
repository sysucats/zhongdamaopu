const { randomUUID } = require('crypto');

// 发号计数器集中存在 setting 的一条文档：counters.<徽章 key> = { seq, ready, leaseOwner, leaseUntil }。
// 徽章 key 只含小写字母、数字、- 和 _，可直接作字段名。
const DOC_ID = 'achievement_serial';
// 旧版每枚徽章一条 setting 文档；首次用到时把号码搬进合并文档，旧文档不再读写。
const legacyId = key => `achievement_serial:${key}`;
const field = key => `counters.${key}`;

const settings = db => db.collection('setting');

async function counters(db) {
  const { result } = await settings(db).findOne({ _id: DOC_ID });
  return result?.counters || {};
}

async function state(db, key) {
  return (await counters(db))[key] || null;
}

// 一次读出全部计数器（list/activateAll 用）；还没搬过来的徽章先看旧文档。
async function states(db) {
  const map = new Map(Object.entries(await counters(db)));
  for (let skip = 0; ; skip += 100) {
    const { result } = await settings(db).find({ _id: { $regex: '^achievement_serial:' } }, { skip, limit: 100 });
    for (const row of result || []) {
      const key = row._id.slice('achievement_serial:'.length);
      if (!map.has(key)) map.set(key, { seq: row.seq || 0, ready: !!row.ready });
    }
    if (!result || result.length < 100) return map;
  }
}

async function claim(db, key) {
  const owner = randomUUID(), now = new Date(), f = field(key);
  await settings(db).updateOne({
    _id: DOC_ID,
    [`${f}.seq`]: { $exists: true },
    $or: [
      { [`${f}.leaseOwner`]: { $exists: false } },
      { [`${f}.leaseUntil`]: { $lte: now } },
    ],
  }, { $set: { [`${f}.leaseOwner`]: owner, [`${f}.leaseUntil`]: new Date(now.getTime() + 120000) } });
  const counter = await state(db, key);
  return counter?.leaseOwner === owner ? counter : null;
}

async function release(db, key, owner) {
  const f = field(key);
  await settings(db).updateOne({ _id: DOC_ID, [`${f}.leaseOwner`]: owner }, {
    $unset: { [`${f}.leaseOwner`]: '', [`${f}.leaseUntil`]: '' },
  });
}

// 首次使用时建计数器：取旧版计数器与已发最大编号中较大者续号，保证不重号。
async function ensure(db, key) {
  if (await state(db, key)) return;
  const [{ result: legacy }, { result: highest }] = await Promise.all([
    settings(db).findOne({ _id: legacyId(key) }),
    db.collection('achievement').find({ key, serialNo: { $gt: 0 } }, { sort: { serialNo: -1 }, limit: 1 }),
  ]);
  const seq = Math.max(legacy?.seq || 0, highest?.[0]?.serialNo || 0);
  try {
    await settings(db).updateOne({ _id: DOC_ID }, { $setOnInsert: { counters: {} } }, { upsert: true });
  } catch (error) {
    // 并发首建时另一方已插入，忽略。
    if (!(await settings(db).findOne({ _id: DOC_ID })).result) throw error;
  }
  await settings(db).updateOne({ _id: DOC_ID, [field(key)]: { $exists: false } }, {
    $set: { [field(key)]: { seq, ready: !!legacy?.ready } },
  });
}

// 发奖、补号、目录编辑和删除共用成就编号锁。
async function withLock(db, key, action) {
  await ensure(db, key);
  for (let attempt = 0; attempt < 64; attempt++) {
    const locked = await claim(db, key);
    if (!locked) {
      await new Promise(resolve => setTimeout(resolve, 10));
      continue;
    }
    try {
      return await action(locked);
    } finally {
      await release(db, key, locked.leaseOwner);
    }
  }
  throw new Error('徽章正在更新，请稍后重试');
}

// 只在仍持有锁时写计数器。
const writeLocked = (db, key, owner, values) => settings(db).updateOne(
  { _id: DOC_ID, [`${field(key)}.leaseOwner`]: owner },
  { $set: Object.fromEntries(Object.entries(values).map(([name, value]) => [`${field(key)}.${name}`, value])) },
);

async function allocate(db, key, issue = serialNo => serialNo) {
  return withLock(db, key, async locked => {
    const next = locked.seq + 1;
    if (!Number.isSafeInteger(next) || next < 1) throw new Error('徽章编号分配失败');
    await writeLocked(db, key, locked.leaseOwner, { seq: next });
    const saved = await state(db, key);
    if (saved?.leaseOwner !== locked.leaseOwner || saved.seq !== next) throw new Error('徽章编号分配失败');
    return issue(next);
  });
}

async function prepare(db, key) {
  return withLock(db, key, async locked => {
    const awards = db.collection('achievement');
    const missing = { key, $or: [{ serialNo: { $exists: false } }, { serialNo: null }, { serialNo: { $lte: 0 } }] };
    const { result: highest } = await awards.find({ key, serialNo: { $gt: 0 } }, { sort: { serialNo: -1 }, limit: 1 });
    const base = Math.max(locked.seq || 0, highest?.[0]?.serialNo || 0);
    const { result: rows } = await awards.find(missing, { sort: { create_date: 1, _id: 1 }, limit: 25 });
    if (rows?.length) {
      // 先预留整批编号，失败重试不复用已分配的号段。
      await writeLocked(db, key, locked.leaseOwner, { seq: base + rows.length, ready: false });
      const results = await Promise.allSettled(rows.map((row, index) =>
        awards.updateOne({ _id: row._id, $or: missing.$or }, { $set: { serialNo: base + index + 1 } })
      ));
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
    }
    const { result: remaining } = await awards.count(missing);
    await writeLocked(db, key, locked.leaseOwner, { seq: base + (rows?.length || 0), ready: remaining === 0 });
    return { pending: remaining > 0, remaining };
  });
}

module.exports = { DOC_ID, state, states, allocate, prepare, withLock, revision: 'readback-v3' };
