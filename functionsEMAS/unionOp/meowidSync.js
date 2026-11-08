const crypto = require('crypto');
const { READ_TIMEOUT_MS, LEASE_TIMEOUT_MS, RESPONSE_RESERVE_MS,
  CAT_COST_MS, PHOTO_COST_MS, TASK_COST_MS } = require('./meowidTiming');

// 每批扫描的条数：只有真正需要写库的猫/照片才产生额外请求
const CAT_PAGE = 100;
const PHOTO_PAGE = 100;
const TASK_PAGE = 200;

function stateId(config) {
  return 'meowidSync-' + crypto.createHash('sha256').update(config.projectId).digest('hex').slice(0, 20);
}

// A receipt is evidence of a remote submission, even if a stale status says retry.
const receiptQuery = { $or: [
  { 'meowid_sync.taskId': { $exists: true, $nin: [null, ''] } },
  { 'meowid_sync.imageId': { $exists: true, $nin: [null, ''] } },
] };
const noReceiptQuery = { $and: [
  { $or: [{ 'meowid_sync.taskId': { $exists: false } }, { 'meowid_sync.taskId': { $in: [null, ''] } }] },
  { $or: [{ 'meowid_sync.imageId': { $exists: false } }, { 'meowid_sync.imageId': { $in: [null, ''] } }] },
] };
function imageLimit(config) {
  return Number.isSafeInteger(config.enrollImagesPerCat) && config.enrollImagesPerCat >= 5 ? config.enrollImagesPerCat : 5;
}
function candidates(config, now, readyOnly = true, limited = false) {
  const downloading = { 'meowid_sync.status': 'downloading' };
  if (readyOnly) downloading['meowid_sync.leaseUntil'] = { $lte: now };
  const query = { verified: true, $and: [{ $or: [
    { 'meowid_sync.projectId': { $ne: config.projectId } },
    { $and: [noReceiptQuery, { $or: [{ 'meowid_sync.status': 'retry' }, downloading,
      { 'meowid_sync.status': 'limited', ...(limited ? { 'meowid_sync.imageLimit': { $lt: imageLimit(config) } } : {}) }] }] },
  ] }] };
  if (readyOnly) query.$and.push({ $or: [
    { 'meowid_sync.nextAttemptAt': { $exists: false } },
    { 'meowid_sync.nextAttemptAt': { $lte: now } },
  ] });
  return query;
}
// 猫咪档案的远端载荷与指纹：建档、更新、以及"是否已经同步好"的判断必须用同一份算法
// 上传载荷的字段适配层：本库的字段名/取值类型不统一，只在这里归一，
// 不改数据库、不动其它代码，也不改变发给平台的字段名。
const CAT_TEXT_FIELDS = ['gender', 'colour', 'campus', 'area', 'birthday', 'character'];
const TRUTHY = [true, 1, '1', 'true', '是'];

function catPayload(cat) {
  const metadata = { local_id: cat._id };
  for (const key of CAT_TEXT_FIELDS) {
    if (cat[key] !== undefined && cat[key] !== null && cat[key] !== '') metadata[key] = cat[key];
  }
  // adopt：本库既有 0/1/2 也有 '0'/'1'，统一成整数，避免平台侧按数字过滤时漏掉字符串
  const adopt = Number(cat.adopt);
  if (cat.adopt !== undefined && cat.adopt !== null && cat.adopt !== '' && Number.isInteger(adopt)) {
    metadata.adopt = adopt;
  }
  // 绝育状态：本库字段是 sterilized(布尔)，历史数据可能残留 neutered；对外仍用 neutered 这个键
  const sterilized = cat.sterilized !== undefined ? cat.sterilized : cat.neutered;
  if (sterilized !== undefined && sterilized !== null) metadata.neutered = TRUTHY.includes(sterilized);
  const data = {
    name: String(cat.name || cat._id).slice(0, 100),
    metadata,
    // 失踪 / 回喵星 的猫在平台侧不再标为活跃档案
    active: !(TRUTHY.includes(cat.missing) || TRUTHY.includes(cat.to_star)),
  };
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return { data, fingerprint };
}
// 已建档 + 属于本项目 + 上次同步成功 + 档案内容没变 → 不需要任何远端调用或写库
function settled(cat, config) {
  const state = cat.meowid_sync || {};
  if (!cat.meowid_id || cat.meowid_project_id !== config.projectId) return false;
  if (state.status !== 'synced') return false;
  return state.fingerprint === catPayload(cat).fingerprint;
}

async function status(ctx, config) {
  const db = ctx.mpserverless.db;
  const project = { verified: true, 'meowid_sync.projectId': config.projectId };
  const count = async (collection, query) => (await db.collection(collection).count(query)).result || 0;
  const [total, accepted, completed, failed, uncertain, waiting, cats, bound, state, pending, processing, limited] = await Promise.all([
    count('photo', { verified: true }),
    count('photo', { ...project, $or: [receiptQuery,
      { 'meowid_sync.status': { $in: ['queued', 'running', 'completed', 'waiting_user'] } }] }),
    count('photo', { ...project, 'meowid_sync.status': 'completed' }),
    count('photo', { ...project, 'meowid_sync.status': { $in: ['retry', 'failed', 'blocked', 'cancelled'] } }),
    count('photo', { ...project, $and: [noReceiptQuery], 'meowid_sync.status': { $in: ['submitting', 'uncertain'] } }),
    count('photo', { ...project, 'meowid_sync.status': 'waiting_user' }),
    count('cat', { deleted: { $ne: 1 } }),
    count('cat', { deleted: { $ne: 1 }, meowid_project_id: config.projectId, meowid_id: { $exists: true, $nin: [null, ''] } }),
    db.collection('setting').findOne({ _id: stateId(config) }),
    count('photo', candidates(config, Date.now(), false)),
    count('photo', { ...project, 'meowid_sync.status': { $in: ['queued', 'running'] } }),
    count('photo', { ...project, 'meowid_sync.status': 'limited' }),
  ]);
  const current = state.result || {};
  return { total, accepted, completed, failed, uncertain, waiting, cats, bound, pending, processing, limited,
    remainingCats: Math.max(0, cats - bound), remainingPhotos: Math.max(0, total - accepted),
    imageLimit: imageLimit(config), syncMode: current.syncMode === 'limited' ? 'limited' : 'all',
    scanning: !!current.scanning, phase: current.phase || (current.scanning ? 'cats' : 'idle'),
    lastRunAt: current.lastRunAt || null, lastError: current.lastError || '' };
}

async function run(ctx, config, api, options = {}) {
  const db = ctx.mpserverless.db;
  const collection = db.collection('setting');
  const id = stateId(config);
  const owner = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  // 剩余可用时间 = 总预算 - 收尾预留。工作循环一律用"够不够再做一件"判断，
  // 不再用"剩余时间够不够 45s"这种写法（那样每个批次只有几秒真正干活）。
  const remaining = () => config.deadline - Date.now() - RESPONSE_RESERVE_MS;
  const canAfford = cost => remaining() > cost;
  // Uncapped approval uploads claim their own photo below. They do not need the
  // project-wide batch lease used to enforce manual caps and advance cursors.
  const singleApproval = !!options.photoId && options.limited !== true;
  let state = {};
  if (!singleApproval) {
    const { result: existing } = await collection.findOne({ _id: id });
    if (!existing) {
      try { await collection.insertOne({ _id: id, leaseUntil: 0, catCursor: '', taskOffset: 0 }); }
      catch (error) { if (!(await collection.findOne({ _id: id })).result) throw error; }
    }
    await collection.updateOne({ _id: id, $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }] },
      { $set: { leaseOwner: owner, leaseUntil: now + LEASE_TIMEOUT_MS } });
    state = (await collection.findOne({ _id: id })).result;
    // 另一个批次正在跑：直接告诉客户端，不要顺手做十几次统计
    if (!state || state.leaseOwner !== owner) return { ok: true, busy: true };
  }
  const base = '/v1/projects/' + encodeURIComponent(config.projectId);
  // Only an explicitly limited batch uses the cap. Approval uploads and older
  // clients default to all approved photos. Manual modes share a project lease;
  // all uploads still share the atomic per-photo claim and receipt guards.
  const limited = options.limited === true;
  const syncMode = limited ? 'limited' : 'all';
  let phase = state.phase || (state.scanning === false ? 'photos' : 'cats');
  let cursor = phase === 'cats' ? state.catCursor || '' : '';
  if (!options.photoId && !options.tasksOnly && (state.syncMode !== syncMode ||
      (ctx.args && ctx.args.action === 'syncAll' && phase === 'idle'))) {
    phase = 'cats';
    cursor = '';
  }
  let lastError = '';
  let processed = 0;
  // 本批真正落库的动作次数：客户端用它判断"这批到底有没有推进"，避免空转死循环
  let progress = 0;
  let more = false;
  let stage = '读取同步记录';
  // 额度缓存：同一批里同一只猫只算一次，上传成功后本地 +1。
  // 原来的实现每张候选照片都要 count + 逐条 findOne，超额照片越多越慢。
  const slotCache = new Map();
  const bumpSlot = catId => {
    const key = String(catId);
    if (slotCache.has(key)) slotCache.set(key, slotCache.get(key) + 1);
  };
  // Every transition belongs to the worker that claimed this photo. An expired
  // downloader must not overwrite a newer worker's receipt or submit twice.
  const savePhoto = async (photo, value, expectedStatus = 'downloading') => {
    const next = Object.assign({}, photo.meowid_sync || {}, {
      projectId: config.projectId, catId: photo.cat_id, owner, updatedAt: new Date(),
    }, value);
    await db.collection('photo').updateOne({ _id: photo._id,
      'meowid_sync.projectId': config.projectId, 'meowid_sync.owner': owner,
      'meowid_sync.status': expectedStatus,
    }, { $set: { meowid_sync: next } });
    const current = (await db.collection('photo').findOne({ _id: photo._id })).result;
    if (!current || !current.meowid_sync || current.meowid_sync.owner !== owner ||
        current.meowid_sync.projectId !== config.projectId || current.meowid_sync.status !== next.status) return false;
    photo.meowid_sync = current.meowid_sync;
    progress++;
    return true;
  };
  const message = error => {
    const code = String(error.code || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
    const reason = error.status ? 'MeowID HTTP ' + error.status
      : /超时|timeout/i.test(error.message || '') ? '请求超时'
        : code || '网络、响应解析或数据库异常';
    return stage + '：' + reason;
  };
  const report = error => {
    const detail = message(error);
    console.error('[meowidSync]', stage, error.status || '', error.code || '', error.requestId || '', detail);
    return detail;
  };
  const uncertain = error => !error.status || error.status >= 500;

  async function usedSlots(cat, remote) {
    const key = String(cat._id);
    if (slotCache.has(key)) return slotCache.get(key);
    const limit = imageLimit(config);
    const counted = { 'meowid_sync.projectId': config.projectId, $and: [
      { $or: [{ cat_id: cat._id }, { 'meowid_sync.catId': cat._id }, { 'meowid_sync.remoteCatId': remote }] },
      { $or: [receiptQuery, { 'meowid_sync.status': { $in: ['queued', 'running', 'completed', 'waiting_user', 'submitting', 'uncertain'] } }] },
    ] };
    let used = (await db.collection('photo').count(counted)).result || 0;
    // 历史 meowid_images 里可能还有没迁移成 photo 记录的老条目。原来逐条 findOne 去重，
    // 每张照片最多 20+ 次查询；改成一次 $in 查询取回已计入的 _id 集合。
    if (used < limit && (!cat.meowid_project_id || cat.meowid_project_id === config.projectId)) {
      const keys = [];
      const unique = new Set();
      for (const item of cat.meowid_images || []) {
        const legacyKey = String(item.photo_id || item.image_id || item.task_id || 'unknown');
        if (unique.has(legacyKey)) continue;
        unique.add(legacyKey);
        keys.push(legacyKey);
        if (keys.length >= limit + 20) break;
      }
      if (keys.length) {
        const { result: hits } = await db.collection('photo').find({ ...counted, _id: { $in: keys } },
          { limit: keys.length, projection: { _id: 1 } });
        const hit = new Set((hits || []).map(item => String(item._id)));
        for (const legacyKey of keys) if (!hit.has(legacyKey)) used++;
      }
    }
    slotCache.set(key, used);
    return used;
  }

  // 超额照片：只做一次轻量写（不打回读校验），单张 1 次请求即可离开候选集
  async function markLimited(photo, remote) {
    await db.collection('photo').updateOne({ _id: photo._id, verified: true }, { $set: { meowid_sync:
      Object.assign({}, photo.meowid_sync || {}, { projectId: config.projectId, catId: photo.cat_id,
        status: 'limited', imageLimit: imageLimit(config), remoteCatId: remote,
        owner: '', leaseUntil: 0, updatedAt: new Date() }) } });
    progress++;
  }

  async function ensureCat(cat) {
    stage = '关联猫咪档案';
    const { result: latest } = await db.collection('cat').findOne({ _id: cat._id });
    if (!latest || latest.deleted === 1) return null;
    cat = latest;
    let remote = cat.meowid_id;
    const previous = cat.meowid_sync || {};
    if (cat.meowid_project_id && cat.meowid_project_id !== config.projectId) remote = '';
    const { data, fingerprint } = catPayload(cat);
    if (!remote && previous.projectId === config.projectId && previous.status === 'creating') return null;
    if (!remote && previous.projectId === config.projectId && previous.status === 'uncertain') {
      throw new Error('猫咪档案创建结果待核对');
    }
    if (remote && cat.meowid_project_id === config.projectId && previous.status === 'synced' && previous.fingerprint === fingerprint) return remote;
    if (!canAfford(CAT_COST_MS)) return null;
    const syncState = { projectId: config.projectId, status: remote ? 'updating' : 'creating', fingerprint, owner };
    const claim = { _id: cat._id };
    if (!remote) claim.$or = [{ 'meowid_sync.projectId': { $ne: config.projectId } },
      { 'meowid_sync.status': { $nin: ['creating', 'uncertain'] } }];
    await db.collection('cat').updateOne(claim, { $set: { meowid_sync: syncState } });
    const { result: claimed } = await db.collection('cat').findOne({ _id: cat._id });
    if (!claimed || !claimed.meowid_sync || claimed.meowid_sync.owner !== owner) return null;
    try {
      stage = remote ? '更新猫咪档案' : '创建猫咪档案';
      const response = await api.request(config, remote ? 'PATCH' : 'POST',
        base + '/cats' + (remote ? '/' + encodeURIComponent(remote) : ''), { json: data });
      if (!remote) {
        remote = response.body && response.body.id;
        if (!remote) throw new Error('创建猫咪档案未返回编号');
      }
      await db.collection('cat').updateOne({ _id: cat._id }, { $set: {
        meowid_id: remote, meowid_project_id: config.projectId,
        meowid_sync: { ...syncState, status: 'synced' },
      } });
      progress++;
      return remote;
    } catch (error) {
      await db.collection('cat').updateOne({ _id: cat._id }, { $set: {
        meowid_sync: { ...syncState, status: !remote && uncertain(error) ? 'uncertain' : 'retry', error: message(error) },
      } });
      report(error);
      throw error;
    }
  }

  // 已同步好的猫不再回读、不再调用远端：一次列表查询可以扫掉上百只
  async function syncCats(cats) {
    let visited = 0;
    for (const cat of cats || []) {
      if (!canAfford(CAT_COST_MS)) break;
      if (!settled(cat, config)) {
        try { await ensureCat(cat); }
        catch (error) { lastError = message(error); }
      }
      cursor = cat._id;
      visited++;
    }
    return visited;
  }

  try {
    const catBatch = !options.photoId && !options.tasksOnly && phase === 'cats';
    if (catBatch) {
      stage = '遍历猫咪档案';
      const query = { deleted: { $ne: 1 } };
      if (cursor) query._id = { $gt: cursor };
      const { result: cats } = await db.collection('cat').find(query, { sort: { _id: 1 }, limit: CAT_PAGE });
      const visited = await syncCats(cats);
      if (visited === (cats || []).length && visited < CAT_PAGE) { cursor = ''; phase = 'photos'; }
      more = true;
    }

    if (!options.tasksOnly && !catBatch && canAfford(PHOTO_COST_MS)) {
      stage = '读取待上传照片';
      const photoQuery = candidates(config, now, true, limited);
      if (options.photoId) photoQuery._id = options.photoId;
      const { result: photos } = await db.collection('photo').find(photoQuery, { sort: { _id: 1 }, limit: PHOTO_PAGE });
      for (const photo of photos || []) {
        if (!canAfford(PHOTO_COST_MS)) break;
        // Claim before cat lookup or downloading, using the same guarded query
        // as selection. Merely reading an eligible snapshot is not ownership.
        await db.collection('photo').updateOne({ ...candidates(config, Date.now(), true, limited), _id: photo._id,
          cat_id: photo.cat_id,
        }, { $set: { meowid_sync: { projectId: config.projectId, status: 'downloading', owner,
          catId: photo.cat_id, leaseUntil: Date.now() + LEASE_TIMEOUT_MS, updatedAt: new Date() } } });
        const { result: latest } = await db.collection('photo').findOne({ _id: photo._id });
        if (!latest || latest.verified !== true || !latest.meowid_sync ||
            latest.meowid_sync.owner !== owner || latest.meowid_sync.status !== 'downloading') continue;
        const { result: cat } = await db.collection('cat').findOne({ _id: latest.cat_id, deleted: { $ne: 1 } });
        if (!cat) { await savePhoto(latest, { status: 'blocked', error: '猫咪档案不存在或已删除' }); continue; }
        let remote;
        let attemptedUpload = false;
        try {
          remote = await ensureCat(cat);
          if (!remote) {
            stage = '关联猫咪档案';
            await savePhoto(latest, { status: 'retry', error: '猫咪档案创建中或结果待核对，请检查 cat.meowid_sync', nextAttemptAt: Date.now() + 300000 });
            continue;
          }
          // Cat creation has already finished; reserve the remaining download/upload budget.
          if (!canAfford(PHOTO_COST_MS)) {
            await savePhoto(latest, { status: 'retry', error: '本批次时间不足，下一批继续上传' });
            break;
          }
          const old = (!cat.meowid_project_id || cat.meowid_project_id === config.projectId)
            && (cat.meowid_images || []).find(item => String(item.photo_id) === String(latest._id));
          if (old) {
            await savePhoto(latest, { status: old.task_id || old.image_id
              ? old.status || 'queued' : 'uncertain',
              taskId: old.task_id || null, imageId: old.image_id || null, remoteCatId: remote,
              error: old.task_id || old.image_id ? '' : '存在历史同步记录，请核对远端图片，禁止自动重传' });
            continue;
          }
          if (limited && await usedSlots(cat, remote) >= imageLimit(config)) {
            // 额度已满：不再为这张照片下载/上传，也不再重复算额度
            await markLimited(latest, remote);
            continue;
          }
          stage = '下载审核照片';
          const image = await api.download(ctx, config, latest);
          const { result: approved } = await db.collection('photo').findOne({ _id: latest._id, verified: true, cat_id: latest.cat_id });
          if (!approved) continue;
          const sha256 = crypto.createHash('sha256').update(image).digest('hex');
          const source = crypto.createHash('sha256').update(config.projectId + '\0' + String(latest._id)).digest('hex').slice(0, 32);
          const uploadFilename = 'meowid-' + source + '-' + sha256.slice(0, 16);
          if (!await savePhoto(latest, { status: 'submitting', remoteCatId: remote, sha256, uploadFilename })) continue;
          const lease = singleApproval
            ? (await db.collection('photo').findOne({ _id: latest._id,
              'meowid_sync.projectId': config.projectId, 'meowid_sync.owner': owner,
              'meowid_sync.status': 'submitting', 'meowid_sync.leaseUntil': { $gt: Date.now() },
            })).result
            : (await collection.findOne({ _id: id })).result;
          if (!lease || (!singleApproval && (lease.leaseOwner !== owner || lease.leaseUntil <= Date.now()))) {
            await savePhoto(latest, { status: 'retry', error: '批次已被接管，尚未提交图片' }, 'submitting');
            continue;
          }
          attemptedUpload = true;
          try {
            stage = '上传照片到 MeowID';
            const response = await api.request(config, 'POST', base + '/cats/' + encodeURIComponent(remote) + '/images', { image, filename: uploadFilename });
            const taskId = response.body && response.body.task_id;
            if (!taskId) throw new Error('注册图片未返回任务编号');
            if (await savePhoto(latest, { status: 'queued', taskId,
              imageId: response.body.id || null, remoteCatId: remote }, 'submitting')) { processed++; bumpSlot(cat._id); }
          } catch (error) {
            // 预算用尽（请求没发出去）可以安全重试，不能记成 uncertain —— 那会让照片彻底停在候选集外
            const status = error.retryable ? 'retry'
              : uncertain(error) ? 'uncertain' : [400, 413, 415, 422].includes(error.status) ? 'failed' : 'retry';
            const patch = { status, remoteCatId: remote, error: message(error), requestId: error.requestId || '' };
            if (!error.retryable) patch.nextAttemptAt = Date.now() + 300000;
            await savePhoto(latest, patch, 'submitting');
            lastError = report(error);
          }
        } catch (error) {
          const patch = { status: error.retryable ? 'retry' : attemptedUpload ? 'uncertain' : 'retry',
            error: message(error), requestId: error.requestId || '' };
          if (!error.retryable) patch.nextAttemptAt = Date.now() + 300000;
          await savePhoto(latest, patch, attemptedUpload ? 'submitting' : 'downloading');
          lastError = report(error);
        }
      }
      if (!options.photoId) more = ((await db.collection('photo').count(photoQuery)).result || 0) > 0;
    }

    if (!options.photoId && !options.tasksOnly && !catBatch) {
      if (!canAfford(PHOTO_COST_MS) && phase !== 'idle') more = true;
      phase = more ? 'photos' : 'idle';
    }

    if (!options.photoId && (options.tasksOnly || !more) && canAfford(TASK_COST_MS)) {
      stage = '刷新 MeowID 注册任务';
      const offset = state.taskOffset || 0;
      const response = await api.request(config, 'GET', base + '/tasks?limit=' + TASK_PAGE + '&offset=' + offset, { timeout: READ_TIMEOUT_MS });
      const tasks = Array.isArray(response.body) ? response.body : (response.body && response.body.items) || [];
      let checked = 0;
      for (const task of tasks) {
        if (!canAfford(TASK_COST_MS)) break;
        if (!task.id || !['queued', 'running', 'completed', 'waiting_user', 'failed', 'cancelled'].includes(task.status)) { checked++; continue; }
        let photo = (await db.collection('photo').findOne({
          'meowid_sync.projectId': config.projectId, 'meowid_sync.taskId': task.id,
        })).result;
        let recovery = false;
        // New submissions carry a deterministic, content-bound original_name.
        // A generic legacy filename such as "photo" is never safe to auto-match.
        if (!photo && task.cat_id && /^meowid-[a-f0-9]{32}-[a-f0-9]{16}$/.test(task.image_name || '')) {
          photo = (await db.collection('photo').findOne({
            'meowid_sync.projectId': config.projectId, 'meowid_sync.remoteCatId': task.cat_id,
            'meowid_sync.uploadFilename': task.image_name,
            'meowid_sync.status': { $in: ['submitting', 'uncertain'] },
          })).result;
          recovery = !!photo;
        }
        if (photo) {
          const guard = { _id: photo._id, 'meowid_sync.projectId': config.projectId };
          if (recovery) Object.assign(guard, { 'meowid_sync.uploadFilename': task.image_name,
            'meowid_sync.remoteCatId': task.cat_id, 'meowid_sync.status': { $in: ['submitting', 'uncertain'] } });
          else guard['meowid_sync.taskId'] = task.id;
          await db.collection('photo').updateOne(guard, { $set: { meowid_sync: {
            ...photo.meowid_sync, status: task.status, taskId: task.id,
            imageId: task.image_id || photo.meowid_sync.imageId || null, updatedAt: new Date(),
          } } });
        }
        checked++;
      }
      // 走到哪记到哪：整页核完就翻页/回卷，核了一部分也把游标推过去，
      // 避免"总也核不完前 N 条、后面永远轮不到"。
      const nextOffset = checked === tasks.length
        ? (tasks.length < TASK_PAGE ? 0 : offset + tasks.length)
        : (checked > 0 ? offset + checked : offset);
      if (nextOffset !== offset) await collection.updateOne({ _id: id, leaseOwner: owner }, {
        $set: { taskOffset: nextOffset },
      });
    }
  } catch (error) {
    lastError = report(error);
    more = false;
  } finally {
    if (!singleApproval) {
      const patch = { leaseUntil: 0, lastRunAt: new Date() };
      if (!options.photoId && (lastError || !options.tasksOnly)) patch.lastError = lastError;
      if (!options.tasksOnly && !options.photoId) Object.assign(patch, { phase, catCursor: cursor, scanning: phase === 'cats', syncMode });
      await collection.updateOne({ _id: id, leaseOwner: owner }, { $set: patch });
    }
  }
  // 批次调用只回轻量进度：完整统计（十余次 count）留给 syncStatus，避免每批都多花 1-3 秒
  if (options.photoId) return { ok: true, processed, more, progress, error: lastError };
  return { ok: true, processed, more, progress, phase, imageLimit: imageLimit(config), error: lastError };
}

module.exports = { run, status, catPayload };
