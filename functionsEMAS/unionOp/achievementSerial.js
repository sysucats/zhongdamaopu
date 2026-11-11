const { randomUUID } = require('crypto');

const LEASE_VERSION = 2;
const counterId = key => `achievement_serial:${key}`;

async function state(db, key) {
  return (await db.collection('setting').findOne({ _id: counterId(key) })).result;
}

// Write responses differ between EMAS runtimes. Verify ownership through findOne,
// whose document shape is stable, rather than interpreting findOneAndUpdate.
async function claim(db, key, ready) {
  const owner = randomUUID(), now = new Date();
  await db.collection('setting').updateOne({
    _id: counterId(key), ready,
    $or: [
      { leaseOwner: { $exists: false } },
      { leaseUntil: { $lte: now } },
      // Earlier versions took a lock then exited before numbering any awards.
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

async function allocate(db, key) {
  for (let attempt = 0; attempt < 64; attempt++) {
    const locked = await claim(db, key, true);
    if (!locked) {
      if (!(await state(db, key))?.ready) return null;
      await new Promise(resolve => setTimeout(resolve, 10));
      continue;
    }
    try {
      const next = locked.seq + 1;
      if (!Number.isSafeInteger(next) || next < 1) throw new Error('徽章编号分配失败');
      await db.collection('setting').updateOne({ _id: counterId(key), leaseOwner: locked.leaseOwner }, { $set: { seq: next } });
      const saved = await state(db, key);
      if (saved.leaseOwner !== locked.leaseOwner || saved.seq !== next) throw new Error('徽章编号分配失败');
      return next;
    } finally {
      await release(db, key, locked.leaseOwner);
    }
  }
  throw new Error('徽章编号暂时繁忙，请稍后重试');
}

// Existing awards are numbered chronologically in bounded batches before issuing
// new numbers. A renewable invocation can recover from an interrupted batch.
async function prepare(db, key) {
  const counters = db.collection('setting'), awards = db.collection('achievement');
  const id = counterId(key);
  await counters.updateOne({ _id: id }, { $setOnInsert: { seq: 0, ready: false, leaseVersion: LEASE_VERSION } }, { upsert: true });
  if ((await state(db, key)).ready) return { pending: false, remaining: 0 };
  const locked = await claim(db, key, false);
  if (!locked) throw new Error('该徽章编号正在整理，请稍后重试');
  try {
    const { result: highest } = await awards.find({ key, serialNo: { $exists: true } }, { sort: { serialNo: -1 }, limit: 1 });
    let seq = Math.max(locked.seq || 0, highest?.[0]?.serialNo || 0);
    const { result: rows } = await awards.find({ key, serialNo: { $exists: false } }, { sort: { create_date: 1, _id: 1 }, limit: 25 });
    for (const row of rows || []) {
      await awards.updateOne({ _id: row._id, serialNo: { $exists: false } }, { $set: { serialNo: ++seq } });
    }
    const { result: remaining } = await awards.count({ key, serialNo: { $exists: false } });
    await counters.updateOne({ _id: id, leaseOwner: locked.leaseOwner }, { $set: { seq, ready: remaining === 0 } });
    return { pending: remaining > 0, remaining };
  } finally {
    await release(db, key, locked.leaseOwner);
  }
}

module.exports = { state, allocate, prepare, counterId, revision: 'readback-v2' };
