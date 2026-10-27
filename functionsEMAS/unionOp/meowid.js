const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const sync = require('./meowidSync');

const { REQUEST_TIMEOUT_MS, READ_TIMEOUT_MS, DOWNLOAD_TIMEOUT_MS, BATCH_TIMEOUT_MS,
  RESPONSE_RESERVE_MS, UPLOAD_RESERVE_MS } = require('./meowidTiming');
const TIMESTAMP_TOLERANCE_SEC = 900;

module.exports = async ctx => {
  const args = Object.assign({}, ctx.args || {});
  const action = args.action || 'search';
  try {
    const openid = await getCallerOpenid(ctx);
    if (!openid) return { ok: false, code: 'unauthenticated', msg: '请先微信登录后再使用识猫服务' };
    const config = await loadConfig(ctx);
    if (action === 'search') return await search(ctx, config, args);
    if (!(await isManager(ctx, openid))) return { ok: false, code: 'forbidden', msg: '仅管理员可操作' };
    if (action === 'saveConfig') return await saveConfig(ctx, args);
    if (action === 'status' || action === 'syncStatus') {
      if (action === 'status' && config.projectId && config.apiKey && await enabled(ctx)) {
        await sync.run(ctx, config, { request: meowRequest, download: downloadPhoto }, { tasksOnly: true });
      }
      const progress = await sync.status(ctx, config);
      const out = { ok: true, config: { ready: !!(config.projectId && config.apiKey),
        projectIdSet: !!config.projectId, apiKeySet: !!config.apiKey, topK: config.topK, enrollImagesPerCat: config.enrollImagesPerCat }, sync: progress };
      if (args.ping && config.projectId && config.apiKey) {
        try {
          await meowRequest(config, 'GET', projectPath(config) + '/cats?limit=1', { timeout: READ_TIMEOUT_MS });
          out.meowid = { reachable: true, catsReadable: true };
        } catch (error) { out.meowid = Object.assign({ reachable: false }, describeMeowError(error)); }
      }
      return out;
    }
    if (action === 'syncAll' || action === 'syncNext') return await runSync(ctx, config);
    return { ok: false, code: 'unsupported_action', msg: '不支持此操作' };
  } catch (error) {
    const detail = describeMeowError(error);
    console.error('[meowid]', action, detail.code, detail.status, detail.requestId);
    return { ok: false, code: detail.code, msg: detail.msg, requestId: detail.requestId };
  }
};

async function enabled(ctx) {
  const { result: pages } = await ctx.mpserverless.db.collection('setting').findOne({ _id: 'pages' });
  return !!(pages && pages.recognize && pages.recognize.mode === 'meowid');
}

async function runSync(ctx, config) {
  if (!(await enabled(ctx))) return { ok: false, code: 'recognition_disabled', msg: '请先保存 MeowID 识猫模式' };
  if (!config.projectId || !config.apiKey) return { ok: false, code: 'not_configured', msg: '请先配置项目和接口密钥' };
  const syncMode = ctx.args.syncMode === undefined ? 'all' : ctx.args.syncMode;
  if (!['all', 'limited'].includes(syncMode)) return { ok: false, code: 'invalid_sync_mode', msg: '同步方式无效' };
  return sync.run(ctx, config, { request: meowRequest, download: downloadPhoto }, { limited: syncMode === 'limited' });
}

async function search(ctx, config, args) {
  if (!(await enabled(ctx))) return { ok: false, code: 'recognition_disabled', msg: '当前未启用 MeowID 识猫' };
  if (!config.projectId || !config.apiKey) return { ok: false, code: 'not_configured', msg: '请先配置项目和接口密钥' };
  if (typeof args.photoBase64 !== 'string' || !args.photoBase64.length || args.photoBase64.length > 24 * 1024 * 1024) {
    return { ok: false, code: 'invalid_image', msg: '图片数据无效' };
  }
  const secret = await loadSecretKey(ctx);
  if (secret && secret !== 'changeToYourKey') {
    const expected = crypto.createHash('sha256').update(args.photoBase64 + String(args.timestamp) + secret).digest('hex');
    if (!Number.isFinite(Number(args.timestamp)) || Math.abs(Date.now() / 1000 - Number(args.timestamp)) > TIMESTAMP_TOLERANCE_SEC ||
        typeof args.signature !== 'string' || !/^[a-f0-9]{64}$/.test(args.signature) ||
        !crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(args.signature, 'hex'))) {
      return { ok: false, code: 'bad_signature', msg: '请求已过期或签名无效，请重试' };
    }
  }
  const parsed = parseSearchResult(await meowSearch(config, Buffer.from(args.photoBase64, 'base64')));
  const node = pickMatchNode(parsed, args.catIdx);
  const mapped = await mapMatchesToCats(ctx, collectCatIds(parsed));
  const result = buildResults(node, mapped);
  return { ok: true, data: { catCount: parsed.catCount, catBoxes: parsed.catBoxes,
    recognizeResults: result.results, unknown: node.unknown, route: parsed.route, catIdx: node.index } };
}

async function loadConfig(ctx) {
  const { result } = await ctx.mpserverless.db.collection('app_secret').findOne();
  const record = result || {};
  return { baseUrl: String(record.MEOWID_BASE_URL || 'https://platform.meowid.net').replace(/\/+$/, ''),
    projectId: record.MEOWID_PROJECT_ID || '', apiKey: record.MEOWID_API_KEY || '',
    topK: Math.max(1, Math.min(100, parseInt(record.MEOWID_TOP_K, 10) || 5)),
    enrollImagesPerCat: Math.max(5, Number.isSafeInteger(Number(record.MEOWID_ENROLL_IMAGES_PER_CAT)) ? Number(record.MEOWID_ENROLL_IMAGES_PER_CAT) : 5),
    threshold: record.MEOWID_THRESHOLD !== undefined && record.MEOWID_THRESHOLD !== '' ? Number(record.MEOWID_THRESHOLD) : null,
    deadline: Date.now() + BATCH_TIMEOUT_MS };
}

async function saveConfig(ctx, args) {
  const allowed = ['MEOWID_BASE_URL', 'MEOWID_PROJECT_ID', 'MEOWID_API_KEY', 'MEOWID_TOP_K', 'MEOWID_THRESHOLD', 'MEOWID_ENROLL_IMAGES_PER_CAT'];
  const patch = {};
  for (const key of allowed) if (args.data && args.data[key] !== undefined && args.data[key] !== null) patch[key] = args.data[key];
  if (patch.MEOWID_ENROLL_IMAGES_PER_CAT !== undefined) {
    const limit = Number(patch.MEOWID_ENROLL_IMAGES_PER_CAT);
    if (!Number.isSafeInteger(limit) || limit < 5) return { ok: false, msg: '每猫图片上限必须是至少 5 的整数' };
    patch.MEOWID_ENROLL_IMAGES_PER_CAT = limit;
  }
  if (!Object.keys(patch).length) return { ok: false, msg: '没有需要保存的配置' };
  if (patch.MEOWID_BASE_URL) {
    const url = new URL(patch.MEOWID_BASE_URL);
    if (url.protocol !== 'https:' || url.username || url.password) return { ok: false, msg: '接口地址必须使用 HTTPS' };
  }
  const { result: record } = await ctx.mpserverless.db.collection('app_secret').findOne();
  if (!record || !record._id) return { ok: false, msg: '请先在云端创建服务端密钥记录' };
  await ctx.mpserverless.db.collection('app_secret').updateOne({ _id: record._id }, { $set: patch });
  return { ok: true };
}

function projectPath(config) {
  return '/v1/projects/' + encodeURIComponent(config.projectId);
}

async function meowRequest(config, method, path, options = {}) {
  const remaining = config.deadline - Date.now() - RESPONSE_RESERVE_MS;
  if (remaining <= 0) throw new Error('本次同步时间已用尽，下次继续');
  const headers = { Authorization: 'Bearer ' + config.apiKey, Accept: 'application/json' };
  let body;
  if (options.image) {
    const boundary = 'meowid-' + crypto.randomBytes(12).toString('hex');
    const image = options.image;
    const mime = image[0] === 0x89 && image[1] === 0x50 ? 'image/png'
      : image.subarray(0, 4).toString() === 'RIFF' ? 'image/webp' : 'image/jpeg';
    const filename = options.filename && /^[a-zA-Z0-9._-]+$/.test(options.filename) ? options.filename : 'photo';
    body = Buffer.concat([Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="image"; filename="' + filename + '"\r\nContent-Type: ' + mime + '\r\n\r\n'), image, Buffer.from('\r\n--' + boundary + '--\r\n')]);
    headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary;
  } else if (options.json !== undefined) {
    body = Buffer.from(JSON.stringify(options.json));
    headers['Content-Type'] = 'application/json';
  }
  headers['Content-Length'] = body ? body.length : 0;
  const response = await httpsSend(new URL(config.baseUrl + path), method, headers, body,
    Math.min(options.timeout || (method === 'GET' ? READ_TIMEOUT_MS : REQUEST_TIMEOUT_MS), remaining));
  if (response.status < 200 || response.status >= 300) {
    const error = new Error('MeowID HTTP ' + response.status);
    Object.assign(error, { status: response.status, body: response.body, requestId: response.headers['x-request-id'] });
    throw error;
  }
  return { body: response.body.length ? JSON.parse(response.body.toString('utf8')) : null, status: response.status, headers: response.headers };
}

function httpsSend(url, method, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (url.protocol !== 'https:') return reject(new Error('请求地址必须使用 HTTPS'));
    let request;
    let response;
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
        if (response) response.destroy();
        if (request) request.destroy();
      } else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('请求超时')), timeoutMs);
    try {
      request = https.request({ hostname: url.hostname, port: url.port || 443, path: url.pathname + url.search, method, headers }, incoming => {
        if (settled) { incoming.destroy(); return; }
        response = incoming;
        const chunks = [];
        let size = 0;
        incoming.on('data', chunk => {
          if (settled) return;
          size += chunk.length;
          if (size > 64 * 1024 * 1024) return finish(new Error('响应数据过大'));
          chunks.push(chunk);
        });
        incoming.on('end', () => finish(null, { status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks) }));
        incoming.on('error', error => finish(error));
        incoming.on('aborted', () => finish(new Error('响应连接中断')));
        incoming.on('close', () => { if (!settled) finish(new Error('响应未完整接收')); });
      });
      request.on('error', error => finish(error));
      if (body) request.write(body);
      request.end();
    } catch (error) { finish(error); }
  });
}

async function downloadPhoto(ctx, config, photo) {
  let url = photo.photo_compressed || (photo.photo_id !== 'deleted' && photo.photo_id);
  if (!url) throw new Error('照片没有可下载地址');
  const signed = cosSignIfNeeded(url, await loadCosConfig(ctx), 600);
  let headers = signed.headers;
  url = new URL(signed.url);
  const deadline = Math.min(config.deadline - UPLOAD_RESERVE_MS, Date.now() + DOWNLOAD_TIMEOUT_MS);
  for (let hop = 0; hop < 4; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('下载图片超时');
    const response = await httpsSend(url, 'GET', headers, null, remaining);
    if (response.status >= 300 && response.status < 400 && response.headers.location && hop < 3) {
      const next = new URL(response.headers.location, url);
      if (next.origin !== url.origin) headers = {};
      url = next;
      continue;
    }
    if (response.status !== 200 || !response.body.length) throw new Error('下载图片失败 HTTP ' + response.status);
    return response.body;
  }
}

module.exports.syncApprovedPhoto = async (ctx, photoId) => {
  try {
    if (!(await enabled(ctx))) return { ok: true, skipped: true };
    const config = await loadConfig(ctx);
    if (!config.projectId || !config.apiKey) return { ok: false, msg: 'MeowID 尚未配置' };
    const result = await sync.run(ctx, config, { request: meowRequest, download: downloadPhoto }, { photoId });
    const { result: photo } = await ctx.mpserverless.db.collection('photo').findOne({ _id: photoId });
    const current = photo && photo.meowid_sync;
    if (current && current.projectId === config.projectId && ['queued', 'running', 'completed', 'waiting_user'].includes(current.status)) {
      return { ok: true, status: current.status };
    }
    const sameProject = current && current.projectId === config.projectId;
    if (sameProject && current.owner && current.leaseUntil > Date.now() &&
        ['downloading', 'submitting'].includes(current.status)) {
      return { ok: true, pending: true, status: current.status, msg: '照片正在同步，稍后可刷新状态查看结果' };
    }
    return { ok: false, status: result.busy ? 'busy' : sameProject ? current.status : 'pending',
      requestId: sameProject ? current.requestId || '' : '',
      msg: result.busy ? '同步批次正在执行，稍后可继续同步'
        : (sameProject && current.error) || result.error ||
          (sameProject && current.status === 'cancelled' ? '登记任务已放弃，请先核对平台结果，不会自动重复上传' : '本次未提交，请使用全量同步补传') };
  } catch (error) {
    console.error('[meowid review sync]', error.status || '', error.code || '');
    return { ok: false, msg: '同步失败，可通过全量同步补传' };
  }
};

async function getCallerOpenid(ctx) {
  for (let i = 0; i < 2; i++) {
    try {
      const info = await ctx.mpserverless.user.getInfo();
      const user = (info && (info.user || (info.result && info.result.user))) || null;
      const openid = user && (user.oAuthUserId || user.openId || user.openid);
      return openid ? String(openid) : null;
    } catch (e) {
      if (i === 1) {
        console.warn('[catFace] 无法验证调用者身份，拒绝调用');
        return null;
      }
    }
  }
  return null;
}




function parseSearchResult(meow) {
  const body = meow || {};
  const candidates = (body.candidates || []).map((c, i) => ({
    index: typeof c.index === 'number' ? c.index : i,
    score: pickNumber(c, ['score', 'det_score', 'detection_score']),
    route: c.route || '',
    faceDetected: !!c.face_detected,
    unknown: c.unknown !== undefined ? !!c.unknown : !(c.matches || []).length,
    matches: normalizeMatches(c.matches),
    box: pickBox(c),
  }));

  const boxes = [];
  for (const c of candidates) {
    if (c.box) {

      boxes.push(Object.assign({}, c.box, { index: c.index }));
    }
  }

  return {
    catCount: parseInt(body.cat_count) > 0 ? parseInt(body.cat_count) : (candidates.length || 0),
    route: body.route || '',
    faceDetected: !!body.face_detected,
    unknown: !!body.unknown,
    matches: normalizeMatches(body.matches),
    candidates,
    catBoxes: boxes,
  };
}


function pickMatchNode(parsed, catIdx) {
  if (catIdx !== undefined && catIdx !== null && parsed.candidates[catIdx]) {
    const c = parsed.candidates[catIdx];
    return { index: c.index, unknown: c.unknown, matches: c.matches, route: c.route, faceDetected: c.faceDetected };
  }
  if (parsed.matches.length > 0 || parsed.candidates.length === 0) {
    return { index: 0, unknown: parsed.unknown, matches: parsed.matches, route: parsed.route, faceDetected: parsed.faceDetected };
  }
  const c = parsed.candidates[0];
  return { index: c.index, unknown: c.unknown, matches: c.matches, route: c.route, faceDetected: c.faceDetected };
}

function normalizeMatches(list) {
  return (list || []).map((m) => ({

    meowId: m.cat_id || m.catId || m.individual_id || m.identity_id || m.id || '',
    name: m.cat_name || m.name || '',
    score: pickNumber(m, ['score', 'similarity', 'confidence', 'sim']),
    support: pickNumber(m, ['support']),
  })).filter((m) => m.meowId);
}

function pickNumber(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && !isNaN(Number(obj[k]))) {
      return Number(obj[k]);
    }
  }
  return 0;
}

function pickBox(c) {
  const b = c && (c.bbox || c.box || c.rect || c.region || c.det_box);
  let box = null;
  if (Array.isArray(b) && b.length === 4) {
    box = { xmin: Number(b[0]), ymin: Number(b[1]), xmax: Number(b[2]), ymax: Number(b[3]) };
  } else if (b && b.xmin !== undefined) {
    box = { xmin: Number(b.xmin), ymin: Number(b.ymin), xmax: Number(b.xmax), ymax: Number(b.ymax) };
  } else if (c && c.xmin !== undefined) {
    box = { xmin: Number(c.xmin), ymin: Number(c.ymin), xmax: Number(c.xmax), ymax: Number(c.ymax) };
  }
  if (!box || [box.xmin, box.ymin, box.xmax, box.ymax].some((v) => isNaN(v))) {
    return null;
  }

  const normalized = box.xmax <= 1.0001 && box.ymax <= 1.0001 && box.xmax > 0 && box.ymax > 0;
  box.normalized = normalized;
  return box;
}

function buildResults(node, catIds, unmatchedNames) {
  const results = [];
  const unmatched = [];
  const seen = new Set();
  for (const m of node.matches) {
    const catID = catIds[m.meowId];
    if (catID) {
      if (!seen.has(catID)) {
        seen.add(catID);
        results.push({ catID: catID, score: m.score });
      }
    } else if (m.name || m.meowId) {
      unmatched.push({ name: m.name || m.meowId, score: m.score });
    }
  }
  results.sort((a, b) => b.score - a.score);
  if (unmatchedNames) {
    for (const name of unmatchedNames) {
      if (name && !unmatched.some((u) => u.name === name)) {
        unmatched.push({ name: name, score: 0 });
      }
    }
  }
  return { results, unmatched: unmatched.slice(0, 5) };
}

function collectCatIds(parsed) {
  const ids = new Set();
  for (const m of parsed.matches) {
    ids.add(m.meowId);
  }
  for (const c of parsed.candidates) {
    for (const m of c.matches) {
      ids.add(m.meowId);
    }
  }
  return Array.from(ids);
}

async function mapMatchesToCats(ctx, idList) {
  const map = {};
  if (!idList || idList.length === 0) {
    return map;
  }
  for (let i = 0; i < idList.length; i += 100) {
    const chunk = idList.slice(i, i + 100);
    const { result } = await ctx.mpserverless.db.collection('cat').find(
      { meowid_id: { $in: chunk }, deleted: { $ne: 1 } },
      { limit: 100, projection: { _id: 1, meowid_id: 1 } }
    );
    for (const cat of (result || [])) {
      if (cat.meowid_id) {
        map[cat.meowid_id] = cat._id;
      }
    }
  }
  return map;
}




async function loadSecretKey(ctx) {
  try {
    const { result } = await ctx.mpserverless.db.collection('setting').findOne({ _id: 'recognize' });
    if (result && result.secretKey) {
      return String(result.secretKey);
    }
  } catch (e) { /* 忽略，继续尝试下一种 */ }
  try {
    const { result } = await ctx.mpserverless.db.collection('setting').findOne({ _id: 'pages' });
    const key = result && result.recognize && result.recognize.secretKey;
    return key ? String(key) : '';
  } catch (e) {
    return '';
  }
}

async function loadCosConfig(ctx) {
  try {
    const { result } = await ctx.mpserverless.db.collection('app_secret').findOne();
    const s = result || {};
    return {
      endpoint: s.OSS_ENDPOINT || '',
      bucket: s.OSS_BUCKET || '',
      secretId: s.OSS_SECRET_ID || '',
      secretKey: s.OSS_SECRET_KEY || '',
      port: s.OSS_PORT || 443,
    };
  } catch (e) {
    return {};
  }
}


const ADMIN_LEVEL = 99;

async function isManager(ctx, openid) {
  if (!openid) {
    return false;
  }
  const { result } = await ctx.mpserverless.db.collection('user').findOne({ openid: openid });
  return !!(result && result.manager && result.manager >= ADMIN_LEVEL);
}


async function meowSearch(config, imageBuffer) {
  let path = '/v1/projects/' + encodeURIComponent(config.projectId) + '/search?top_k=' + config.topK;
  if (config.threshold !== null && !isNaN(config.threshold)) {
    path += '&threshold=' + config.threshold;
  }


  const response = await meowRequest(config, 'POST', path, { image: imageBuffer, timeout: REQUEST_TIMEOUT_MS, retry: 0 });


  const body = response.body;
  if (!body || typeof body !== 'object' || !Number.isInteger(body.cat_count) || body.cat_count < 0) {
    const error = new Error('MeowID 识别响应缺少有效的 cat_count，请联系管理员检查服务');
    error.code = 'invalid_response';
    throw error;
  }
  return body;
}


function describeMeowError(e) {
  const status = e && e.status ? e.status : 0;
  const requestId = (e && e.requestId) || '';
  if (e && e.code === 'invalid_response') {
    return { status: status, code: e.code, msg: e.message, requestId: requestId };
  }
  let detail = '';
  try {
    const parsed = JSON.parse((e.body || Buffer.from('')).toString('utf8'));
    const d = parsed && parsed.detail;
    detail = typeof d === 'string' ? d : (Array.isArray(d) ? JSON.stringify(d) : (d && d.code) || '');
  } catch (err) { /* 非 JSON，忽略 */ }
  if (e && e.message === '请求超时') {
    return { status: status, code: 'timeout', msg: '识别超时了，请重试一次', requestId: requestId };
  }
  const map = {
    401: 'MeowID 密钥无效或已过期，请到控制台重新生成 API Key',
    403: 'API Key 权限不足或与项目不匹配（建档同步需要 cats:write、cats:read、tasks:read）',
    404: '项目 / 个体 / 图片不存在，请核对 MEOWID_PROJECT_ID',
    409: '任务当前状态不允许该操作',
    413: '图片超过 MeowID 的大小限制（默认 15MiB）',
    415: '图片格式不支持，仅支持 JPEG / PNG / WebP',
    422: '请求参数校验失败，请检查配置',
    429: '调用太频繁了，请稍后再试',
    502: '喵ID 服务端暂时不可用（网关错误），请稍后再试',
    503: 'MeowID 推理服务暂时不可用，请稍后再试',
    504: '喵ID 服务端暂时不可用（网关超时），请稍后再试',
  };
  let msg = map[status];
  if (!msg) {
    msg = status === 0
      ? ('连不上 MeowID（' + ((e && e.message) || '网络错误') + '）')
      : ('MeowID 返回 HTTP ' + status + (detail ? ('：' + detail) : ''));
  }
  if (requestId) {
    msg += '（请求编号 ' + requestId + '）';
  }
  return {
    status: status,
    code: 'meowid_' + (status || 'network'),
    msg: msg,
    requestId: requestId,
    detail: detail,
  };
}


function cosSignIfNeeded(url, cos, expiresSec) {


  if (typeof url === 'string' && /[?&]q-signature=/.test(url)) {
    return { url: url, headers: {} };
  }
  const parsed = parseCosUrl(url);
  if (!parsed || !cos.secretId || !cos.secretKey) {

    return { url: url, headers: {} };
  }






  const cleanUrl = String(url).split('?')[0].split('#')[0];

  const now = Math.floor(Date.now() / 1000) - 1;
  const keyTime = now + ';' + (now + (expiresSec || 600));
  const authorization = buildCosAuthorization({
    secretKey: cos.secretKey,
    secretId: cos.secretId,
    host: parsed.host,


    pathname: parsed.signPath,
    keyTime: keyTime,
  });
  return { url: cleanUrl, headers: { Authorization: authorization } };
}

function buildCosAuthorization(opts) {
  const signKey = hmacSha1Hex(opts.secretKey, opts.keyTime);
  const httpHeaders = 'host=' + camSafeUrlEncode(opts.host).toLowerCase();
  const httpString = 'get\n' + opts.pathname + '\n\n' + httpHeaders + '\n';
  const stringToSign = 'sha1\n' + opts.keyTime + '\n' + sha1hex(httpString) + '\n';
  const signature = hmacSha1Hex(signKey, stringToSign);
  return [
    'q-sign-algorithm=sha1',
    'q-ak=' + opts.secretId,
    'q-sign-time=' + opts.keyTime,
    'q-key-time=' + opts.keyTime,
    'q-header-list=host',
    'q-url-param-list=',
    'q-signature=' + signature,
  ].join('&');
}

function parseCosUrl(url) {
  if (!url || typeof url !== 'string' || url.indexOf('myqcloud.com') < 0) {
    return null;
  }
  try {
    const u = new URL(url);
    const m = u.hostname.match(/^([^.]+)\.cos\.([^.]+)\.myqcloud\.com$/);
    if (!m) {
      return null;
    }
    return {
      host: u.hostname,
      bucket: m[1],
      region: m[2],
      pathname: u.pathname,               // 编码后的路径，用于实际请求
      signPath: decodeURIComponent(u.pathname), // 解码后的路径，用于签名
      key: decodeURIComponent(u.pathname.slice(1)),
    };
  } catch (e) {
    return null;
  }
}

function camSafeUrlEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21').replace(/'/g, '%27')
    .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

function sha1hex(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

function hmacSha1Hex(key, str) {
  return crypto.createHmac('sha1', key).update(str).digest('hex');
}
