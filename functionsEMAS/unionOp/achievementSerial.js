const { randomUUID } = require('crypto');

// 每枚徽章一条发号计数器，_id 即徽章 key。
const COLLECTION = 'achievement_serial';
const LEASE_VERSION = 2;

const counters = db => db.collection(COLLECTION);

async function state(db, key) {
  return (await counters(db).findOne({ _id: key })).result;
}

async function scan(collection, query = {}) {
  const rows = [];
  for (;;) {
    const { result } = await collection.find(query, { skip: rows.length, limit: 100 });
    rows.push(...(result || []));
    if (!result || result.length < 100) return rows;
  }
}

// 一次读出全部计数器（list/activateAll 用），条数约等于徽章数。
async function states(db) {
  return new Map((await scan(counters(db))).map(row => [row._id, row]));
}

async function claim(db, key) {
  const owner = randomUUID(), now = new Date();
  await counters(db).updateOne({
    _id: key,
    $or: [
      { leaseOwner: { $exists: false } },
      { leaseUntil: { $lte: now } },
      // 接管旧版未标记租约版本的锁。
      { leaseVersion: { $exists: false } },
    ],
  }, { $set: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + 120000), leaseVersion: LEASE_VERSION } });
  const counter = await state(db, key);
  return counter?.leaseOwner === owner ? counter : null;
}

async function release(db, key, owner) {
  await counters(db).updateOne({ _id: key, leaseOwner: owner }, {
    $unset: { leaseOwner: '', leaseUntil: '' },
  });
}

// 首次使用时建计数器：从已发最大编号续号，保证不重号。
async function ensure(db, key) {
  if (await state(db, key)) return;
  const { result: highest } = await db.collection('achievement').find(
    { key, serialNo: { $gt: 0 } }, { sort: { serialNo: -1 }, limit: 1 }
  );
  await counters(db).updateOne({ _id: key }, {
    $setOnInsert: { seq: highest?.[0]?.serialNo || 0, ready: false, leaseVersion: LEASE_VERSION },
  }, { upsert: true });
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

async function allocate(db, key, issue = serialNo => serialNo) {
  return withLock(db, key, async locked => {
    const next = locked.seq + 1;
    if (!Number.isSafeInteger(next) || next < 1) throw new Error('徽章编号分配失败');
    await counters(db).updateOne({ _id: key, leaseOwner: locked.leaseOwner }, { $set: { seq: next } });
    const saved = await state(db, key);
    if (saved.leaseOwner !== locked.leaseOwner || saved.seq !== next) throw new Error('徽章编号分配失败');
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
      await counters(db).updateOne({ _id: key, leaseOwner: locked.leaseOwner }, {
        $set: { seq: base + rows.length, ready: false },
      });
      const results = await Promise.allSettled(rows.map((row, index) =>
        awards.updateOne({ _id: row._id, $or: missing.$or }, { $set: { serialNo: base + index + 1 } })
      ));
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
    }
    const { result: remaining } = await awards.count(missing);
    await counters(db).updateOne({ _id: key, leaseOwner: locked.leaseOwner }, {
      $set: { seq: base + (rows?.length || 0), ready: remaining === 0 },
    });
    return { pending: remaining > 0, remaining };
  });
}

module.exports = { COLLECTION, state, states, allocate, prepare, withLock, revision: 'readback-v3' };
