const { randomUUID } = require('crypto');

const LEASE_VERSION = 2;
const counterId = key => `achievement_serial:${key}`;

async function state(db, key) {
  return (await db.collection('setting').findOne({ _id: counterId(key) })).result;
}

async function claim(db, key) {
  const owner = randomUUID(), now = new Date();
  await db.collection('setting').updateOne({
    _id: counterId(key),
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
  await db.collection('setting').updateOne({ _id: counterId(key), leaseOwner: owner }, {
    $unset: { leaseOwner: '', leaseUntil: '' },
  });
}

// 发奖、补号、目录编辑和删除共用成就编号锁。
async function withLock(db, key, action) {
  if (!await state(db, key)) {
    const { result: highest } = await db.collection('achievement').find(
      { key, serialNo: { $gt: 0 } }, { sort: { serialNo: -1 }, limit: 1 }
    );
    await db.collection('setting').updateOne({ _id: counterId(key) }, {
      $setOnInsert: { seq: highest?.[0]?.serialNo || 0, ready: false, leaseVersion: LEASE_VERSION },
    }, { upsert: true });
  }
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
    await db.collection('setting').updateOne({ _id: counterId(key), leaseOwner: locked.leaseOwner }, { $set: { seq: next } });
    const saved = await state(db, key);
    if (saved.leaseOwner !== locked.leaseOwner || saved.seq !== next) throw new Error('徽章编号分配失败');
    return issue(next);
  });
}

async function prepare(db, key) {
  return withLock(db, key, async locked => {
    const counters = db.collection('setting'), awards = db.collection('achievement');
    const missing = { key, $or: [{ serialNo: { $exists: false } }, { serialNo: null }, { serialNo: { $lte: 0 } }] };
    const { result: highest } = await awards.find({ key, serialNo: { $gt: 0 } }, { sort: { serialNo: -1 }, limit: 1 });
    const base = Math.max(locked.seq || 0, highest?.[0]?.serialNo || 0);
    const { result: rows } = await awards.find(missing, { sort: { create_date: 1, _id: 1 }, limit: 25 });
    if (rows?.length) {
      // 先预留整批编号，失败重试不复用已分配的号段。
      await counters.updateOne({ _id: counterId(key), leaseOwner: locked.leaseOwner }, {
        $set: { seq: base + rows.length, ready: false },
      });
      const results = await Promise.allSettled(rows.map((row, index) =>
        awards.updateOne({ _id: row._id, $or: missing.$or }, { $set: { serialNo: base + index + 1 } })
      ));
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
    }
    const { result: remaining } = await awards.count(missing);
    await counters.updateOne({ _id: counterId(key), leaseOwner: locked.leaseOwner }, {
      $set: { seq: base + (rows?.length || 0), ready: remaining === 0 },
    });
    return { pending: remaining > 0, remaining };
  });
}

module.exports = { state, allocate, prepare, withLock, counterId, revision: 'readback-v3' };
