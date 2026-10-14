// catFace 云函数：猫谱小程序的「识猫」入口（对接喵ID MeowID 开放平台）
//
// 文档：https://meowid.net/developers   控制台：https://platform.meowid.net
//
// 能力：
//   1) 识别：把照片转发给 MeowID 做个体识别，映射回本地 cat._id（API Key 不下发到小程序）
//   2) 建档：把本地猫咪创建为 MeowID 个体、上传已审核照片做注册图，并把个体 id 写回 cat.meowid_id
//      - enrollBatch：批量挑「未绑定」的猫建档（单批次受时间预算约束）
//      - enrollCat：对「指定的一只猫」补传注册图，含已建过档的猫；dry_run 可先预览差异
//   3) 额度：每人每天免费次数；广告奖励接口默认禁用，需先接入服务端凭证验证
//   4) 自检：前端/管理端均可查询「识别服务是否配置好」
//
// 运行时：本参考实现专用于 EMAS Serverless，依赖 ctx.mpserverless 的身份与数据库 API。
// 安全：所有 action 均要求平台验证的微信登录身份，忽略请求中自行声明的 openid；
//       管理操作还需 user.manager >= 99（与小程序端识猫服务页门槛一致），身份读取失败时拒绝调用。
//       小程序共享签名只作附加校验，不能替代平台身份验证。
//
// 需要在服务端密钥配置里填写（只存服务端，绝不放进小程序源码）：
//   配置存于 EMAS 数据库 app_secret 文档；移植其他平台需另行适配身份与数据库 API：
//   MEOWID_BASE_URL    默认 https://platform.meowid.net
//   MEOWID_PROJECT_ID  控制台项目页复制的 Project ID（是项目 ID，不是猫咪 ID）
//   MEOWID_API_KEY     项目 API Key（mk_live_…）
//   MEOWID_TOP_K       默认 5，取值 1-100
//   MEOWID_THRESHOLD   拒绝阈值 -1~1，不填用模型默认；建议用自己猫猫的照片实测后确定
//   MEOWID_ENROLL_IMAGES_PER_CAT  每只猫上传几张注册图，默认 3
//   MEOWID_ENROLL_USE_ORIGINAL    1=用原图建档，默认用压缩图（快、无水印）
//   MEOWID_ENROLL_ONLY_BEST       默认 1=注册图只用「精选」照片；写 0 则用所有过审照片
//   MEOWID_ENROLL_DEADLINE_SEC    单批次建档总预算秒数，默认 40，上限锁 50（见下方 60s 说明）
//   RECOGNIZE_FREE_PER_DAY  每人每天免费次数，默认 3
//   RECOGNIZE_AD_BONUS      广告奖励次数配置，默认 2；grantBonus 默认不发放奖励
//
// API Key 需要的权限（Scope）：
//   只做识别          → recognition:write
//   识别 + 建档同步    → recognition:write + cats:write + tasks:read
//   自检里的连通性测试 → 额外需要 cats:read（可选）
//
// 部署要求：内存 512M 起；函数超时时间设 120 秒（大于客户端上限即可，别设成 60 与客户端撞车）。
// ⚠️ EMAS 对「客户端调用」有 60 秒硬上限（不可调），本函数全部由小程序页面调用，
//    因此代码内部用 42s 识别 / 40s 软预算 / 52s 硬截止自我保护，保证永远在 60s 前自己返回。
//
// 版本历史：
//   v1.0 初版：签名校验 + 每日额度 + 转发识别
//   v1.1 按官方文档重写：unknown/candidates 语义、错误码映射、429 重试、
//        建档绑定 cat.meowid_id、status 自检、COS 纯 crypto 签名（本函数零依赖）
//   v1.2 saveConfig 支持写空值/0（用于清空阈值回到模型默认）、未检测到猫不扣额度、
//        debugHint 回传原始响应骨架便于排查
//   v1.2.1 修复 HTTP 响应 body 解包，统一使用平台身份，并默认禁用未经验证的广告奖励
//   v1.2.2 适配 EMAS「客户端调用 60s 硬上限」：识别 42s、建档软 40s/硬 52s、诊断加硬截止，
//          识别与诊断不再重试（遇 429 直接如实报错），彻底消除 FunctionTimeout 强杀

const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

const DEFAULT_BASE = 'https://platform.meowid.net';
const SERVICE_VERSION = '1.2.2-emas60s-budget';
const TIMESTAMP_TOLERANCE_SEC = 15 * 60;

// ── 时间预算（关键：EMAS Serverless 对「客户端调用」有 60 秒硬上限）────────────
// 官方系统限制（EMAS Serverless > 系统限制 > 云函数）：客户端请求最大超时时间 = 60 秒。
// catFace 全部由小程序页面调用，所以函数必须在 60s 内自行返回；超了会被平台强杀，
// 前端只能看到一个干巴巴的 FunctionTimeout，拿不到任何结果。
// ⚠️ 定时任务（timeTrigger）不受此限、单次可跑 7200s，两者预算口径不要混用。
const CLIENT_REQUEST_HARD_LIMIT_MS = 60000;

// 识别：把照片转发给 MeowID 等推理结果。官方示例给 120s，但我们被 60s 卡着，
// 留 18s 给鉴权 / 额度 / 落库 / 返回，所以这里给 42s。
const RECOGNIZE_TIMEOUT_MS = 42000;
// 建个体 / 上传注册图（MeowID 写操作）
const WRITE_TIMEOUT_MS = 20000;
// 列表 / 状态类读操作
const READ_TIMEOUT_MS = 15000;
// 从 COS 下载一张照片。压缩图通常几百 KB，10s 足够；给太长会让一张图吃掉整个预算。
const PHOTO_DOWNLOAD_TIMEOUT_MS = 10000;
// 建档软预算：到点就停下、如实报告「剩下的下次继续」（可用 MEOWID_ENROLL_DEADLINE_SEC 调整）
const ENROLL_DEADLINE_MS = 40000;
// 建档硬保护线：任何一步网络操作开工前都核算「最坏耗时塞不塞得进剩余时间」，
// 塞不进就不开工 —— 保证函数永远在 60s 平台上限之前自己返回，不被强杀。
const ENROLL_HARD_DEADLINE_MS = 52000;
// 写操作官方限流 10 次/秒，留足余量
const WRITE_INTERVAL_MS = 150;
// 官方限制：单张图片最大 15MiB，仅支持 JPEG / PNG / WebP。
// 超限只在上传后才会收到 413，白白浪费一次下载和一次请求，
// 所以发送前先自己量一次，直接给出能照做的提示。
const MEOWID_MAX_IMAGE_BYTES = 15 * 1024 * 1024;

// 「现在」还能不能开工一段最坏耗时 costMs 的操作（留 2s 落库/统计余量）。
// 建档链路里所有可能慢的网络步骤，开工前都要过这道闸 —— 这是保证
// 云函数永远在自己的超时上限之前自己返回、不被 EMAS 强杀的关键。
function canAffordOp(now, hardDeadline, costMs) {
  return !hardDeadline || now + costMs + 2000 <= hardDeadline;
}

module.exports = async (ctx) => {
  const args = Object.assign({}, ctx.args || {});
  const action = args.action || 'search';

  try {
    const callerOpenid = await getCallerOpenid(ctx);
    if (!callerOpenid) {
      return { ok: false, code: 'unauthenticated', msg: '请先微信登录后再使用识猫服务' };
    }
    // 请求参数不构成身份凭证；所有 action 只能以平台验证的调用者身份执行。
    args.openid = callerOpenid;

    switch (action) {
      case 'status':
        return await statusAction(ctx, args);
      case 'quota':
        return await quotaAction(ctx, args);
      case 'grantBonus':
        return await grantBonusAction(ctx, args);
      case 'grantTestQuota':
        return await grantTestQuotaAction(ctx, args);
      case 'enrollBatch':
        return await enrollBatchAction(ctx, args);
      case 'enrollCat':
        return await enrollCatAction(ctx, args);
      case 'bind':
        return await bindAction(ctx, args);
      case 'unbind':
        return await unbindAction(ctx, args);
      case 'syncTasks':
        return await syncTasksAction(ctx, args);
      case 'retryTask':
        return await retryTaskAction(ctx, args);
      case 'catImages':
        return await catImagesAction(ctx, args);
      case 'saveConfig':
        return await saveConfigAction(ctx, args);
      case 'diagnose':
        return await diagnoseAction(ctx, args);
      case 'search':
        return await searchAction(ctx, args);
      default:
        return { ok: false, msg: '未知操作：' + action };
    }
  } catch (e) {
    console.error('[catFace] 未捕获异常:', action, e && e.stack);
    return { ok: false, msg: (e && e.message) || '服务异常，请稍后再试' };
  }
};

// 与上游 unionOp/_helper.js 的身份读取模式保持一致；平台异常重试一次后拒绝调用。
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

// =====================================================================
// 一、识别
// =====================================================================
async function searchAction(ctx, args) {
  const { photoBase64, signature, timestamp, openid, catIdx } = args;
  if (!photoBase64) {
    return { ok: false, msg: '没有收到照片' };
  }
  if (!openid) {
    return { ok: false, msg: '缺少用户标识' };
  }

  const config = await loadConfig(ctx);
  if (!config.projectId || !config.apiKey) {
    return { ok: false, code: 'not_configured', msg: '识别服务尚未配置，请在 app_secret 里填写 MeowID 项目信息' };
  }

  // 签名校验：secretKey 未配置时跳过（此时前端也不需要签名）
  const signRequired = await isSignRequired(ctx);
  if (signRequired) {
    if (!timestamp || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > TIMESTAMP_TOLERANCE_SEC) {
      return { ok: false, code: 'expired', msg: '请求已过期，请重试' };
    }
    const secretKey = await loadSecretKey(ctx);
    const expect = crypto.createHash('sha256')
      .update(String(photoBase64) + String(timestamp) + String(secretKey))
      .digest('hex');
    if (expect !== signature) {
      return { ok: false, code: 'bad_signature', msg: '签名校验失败' };
    }
  }

  // 每日额度
  const quota = await checkQuota(ctx, openid, config);
  if (quota.left <= 0) {
    return {
      ok: false,
      code: 'quota_exceeded',
      msg: '今天的识别次数用完啦',
      quota,
      adBonus: config.adBonus,
    };
  }

  // 发送前先量体积：超过 MeowID 的 15MiB 上限就直接提示，
  // 不必等对方回 413，也不会浪费一次请求（此时不扣额度）
  const imageBuf = Buffer.from(photoBase64, 'base64');
  if (imageBuf.length > MEOWID_MAX_IMAGE_BYTES) {
    return {
      ok: false,
      code: 'image_too_large',
      msg: '图片超过 MeowID 的 15MiB 上限，请换一张小一点的再试',
      bytes: imageBuf.length,
    };
  }

  let meow;
  try {
    meow = await meowSearch(config, imageBuf);
  } catch (e) {
    const err = describeMeowError(e);
    console.error('[catFace] MeowID 识别失败:', JSON.stringify(err));
    return { ok: false, code: err.code, msg: err.msg, requestId: err.requestId };
  }

  // 官方语义：先看 unknown，再看 matches；多猫时逐只读 candidates
  const parsed = parseSearchResult(meow);
  const node = pickMatchNode(parsed, catIdx);
  const catIds = await mapMatchesToCats(ctx, collectCatIds(parsed));
  const result = buildResults(node, catIds, parsed.unmatchedNames);

  // 只有「照片里确实有猫」才扣次数。
  // 拍糊了 / 没拍到猫 / 猫太小时不计费，否则用户拿几张废片就把当日额度耗光，
  // 却一次识别结果都没看到。
  const consumed = parsed.catCount > 0;
  if (consumed) {
    await consumeQuota(ctx, openid);
  }

  // 只读诊断骨架：把 MeowID 原始响应的关键字段一起回传，便于在真机上直接看清
  // 「到底是没检测到猫，还是字段名对不上」。不含任何密钥。
  const rawObj = (meow && typeof meow === 'object') ? meow : {};
  const debugHint = {
    serviceVersion: SERVICE_VERSION,
    bytes: imageBuf.length,
    rawKeys: Object.keys(rawObj).slice(0, 20),
    rawCatCount: rawObj.cat_count,
    rawRoute: rawObj.route,
    rawUnknown: rawObj.unknown,
    matchesLen: Array.isArray(rawObj.matches) ? rawObj.matches.length : -1,
    candidatesLen: Array.isArray(rawObj.candidates) ? rawObj.candidates.length : -1,
    snippet: JSON.stringify(rawObj).slice(0, 300),
  };

  return {
    ok: true,
    data: {
      catBoxes: parsed.catBoxes,
      recognizeResults: result.results,
      unmatched: result.unmatched,
      route: parsed.route,
      faceDetected: parsed.faceDetected,
      catCount: parsed.catCount,
      unknown: node.unknown,
      candidateCount: parsed.candidates.length,
      catIdx: node.index,
      quotaConsumed: consumed,
      debugHint: debugHint,
    },
    quota: {
      left: Math.max(0, quota.left - (consumed ? 1 : 0)),
      limit: quota.limit,
      used: quota.used + (consumed ? 1 : 0),
      adBonus: config.adBonus,
    },
  };
}

// 把官方响应拆成统一结构
// 官方响应：{ cat_count, route, face_detected, unknown, matches[], candidates[], task_id }
//   matches[]    : { cat_id, cat_name, score, support } —— score 是个体相似度
//   candidates[] : { index, score, route, face_detected, unknown, matches[] } —— score 是检测分数
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
      // 带上 candidate 的 index，前端点框切换某只猫时用它回传
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

// 选出「本次要展示」的那一只猫的匹配列表
// catIdx 由前端点击猫猫框时传入；官方顶层 matches 只对应检测到的第一只猫
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
    // 官方字段是 cat_id / cat_name，其余命名做兼容兜底
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

// 官方文档未承诺返回 bbox，这里做兼容：拿不到就没有猫猫框，前端会自动隐藏
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
  // 全部 ≤1 视为归一化坐标（0~1），前端按比例还原
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

// MeowID 个体 id → 本地 cat._id
async function mapMatchesToCats(ctx, idList) {
  const map = {};
  if (!idList || idList.length === 0) {
    return map;
  }
  for (let i = 0; i < idList.length; i += 100) {
    const chunk = idList.slice(i, i + 100);
    const { result } = await ctx.mpserverless.db.collection('cat').find(
      { meowid_id: { $in: chunk } },
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

// =====================================================================
// 二、配置 / 自检
// =====================================================================
async function loadConfig(ctx) {
  const { result } = await ctx.mpserverless.db.collection('app_secret').findOne();
  const s = result || {};
  return {
    baseUrl: String(s.MEOWID_BASE_URL || DEFAULT_BASE).replace(/\/+$/, ''),
    projectId: s.MEOWID_PROJECT_ID || '',
    apiKey: s.MEOWID_API_KEY || '',
    topK: parseInt(s.MEOWID_TOP_K) > 0 ? Math.min(100, parseInt(s.MEOWID_TOP_K)) : 5,
    threshold: s.MEOWID_THRESHOLD !== undefined && s.MEOWID_THRESHOLD !== '' ? Number(s.MEOWID_THRESHOLD) : null,
    enrollImagesPerCat: parseInt(s.MEOWID_ENROLL_IMAGES_PER_CAT) > 0 ? parseInt(s.MEOWID_ENROLL_IMAGES_PER_CAT) : 3,
    enrollUseOriginal: String(s.MEOWID_ENROLL_USE_ORIGINAL || '') === '1',
    // 注册图只用「精选」照片。默认开启：精选是人工挑过的最佳正脸照，
    // 建档质量直接决定识别率；关掉（写 '0'）后会把其它过审照片也拿来补足数量。
    enrollOnlyBest: String(s.MEOWID_ENROLL_ONLY_BEST === undefined ? '1' : s.MEOWID_ENROLL_ONLY_BEST) === '1',
    // 整个建档批次的总预算（秒）。默认 40s；上限锁死在 50s——因为 EMAS 对客户端
    // 调用的硬上限是 60s，留 10s 给鉴权 / 落库 / 返回，绝不能超过。
    enrollDeadlineSec: parseInt(s.MEOWID_ENROLL_DEADLINE_SEC) > 10 ? Math.min(50, parseInt(s.MEOWID_ENROLL_DEADLINE_SEC)) : 40,
    freePerDay: parseInt(s.RECOGNIZE_FREE_PER_DAY) > 0 ? parseInt(s.RECOGNIZE_FREE_PER_DAY) : 3,
    adBonus: parseInt(s.RECOGNIZE_AD_BONUS) > 0 ? parseInt(s.RECOGNIZE_AD_BONUS) : 2,
    // 广告奖励总开关。默认关闭：客户端的广告完成回调不构成服务端凭证，
    // 任何人都能绕过广告直接调 grantBonus。开启等于接受「与项目内徽章模块
    // 看广告领代币相同」的信任级别，由管理员自行决定。
    adEnabled: String(s.RECOGNIZE_AD_ENABLED || '') === '1',
    // 每天最多领几次广告奖励，防止开启后被无限刷
    adBonusMaxPerDay: parseInt(s.RECOGNIZE_AD_BONUS_MAX_PER_DAY) > 0 ? parseInt(s.RECOGNIZE_AD_BONUS_MAX_PER_DAY) : 3,
  };
}

// 识别签名用的 secretKey
// 兼容两种存放位置：setting/_id='recognize'.secretKey 与 setting/_id='pages'.recognize.secretKey
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

async function isSignRequired(ctx) {
  const key = await loadSecretKey(ctx);
  return !!(key && key !== 'changeToYourKey');
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

// 管理类 action 的权限门槛：Level-99，与小程序端「识猫服务 / 页面配置」一致。
// 这里必须独立判定：小程序端只是 UI 限制，直接调云函数可以绕过，服务端才是真正的关卡。
const ADMIN_LEVEL = 99;

async function isManager(ctx, openid) {
  if (!openid) {
    return false;
  }
  const { result } = await ctx.mpserverless.db.collection('user').findOne({ openid: openid });
  return !!(result && result.manager && result.manager >= ADMIN_LEVEL);
}

// 自检：识别页与管理端都用它判断「服务是否配置好」
async function statusAction(ctx, args) {
  const config = await loadConfig(ctx);
  const cos = await loadCosConfig(ctx);
  const signRequired = await isSignRequired(ctx);

  const out = {
    ok: true,
    config: {
      baseUrl: config.baseUrl,
      projectIdSet: !!config.projectId,
      apiKeySet: !!config.apiKey,
      topK: config.topK,
      threshold: config.threshold,
      freePerDay: config.freePerDay,
      enrollImagesPerCat: config.enrollImagesPerCat,
      enrollUseOriginal: config.enrollUseOriginal,
      enrollOnlyBest: config.enrollOnlyBest,
      enrollDeadlineSec: config.enrollDeadlineSec,
      adBonus: config.adBonus,
      adEnabled: config.adEnabled,
      adBonusMaxPerDay: config.adBonusMaxPerDay,
      signRequired: signRequired,
      ready: !!(config.projectId && config.apiKey),
    },
    cos: {
      endpoint: cos.endpoint,
      bucket: cos.bucket,
      secretSet: !!(cos.secretId && cos.secretKey),
      ready: !!(cos.endpoint && cos.bucket && cos.secretId && cos.secretKey),
    },
  };

  // 绑定进度（管理端要看的）
  try {
    const totalCats = await countCats(ctx, { deleted: { $ne: 1 } });
    const boundCats = await countCats(ctx, { deleted: { $ne: 1 }, meowid_id: { $nin: [null, ''] } });
    const { result: pending } = await ctx.mpserverless.db.collection('cat').find(
      unboundQuery(),
      { limit: 100, projection: { _id: 1 } }
    );
    out.binding = {
      totalCats: totalCats,
      boundCats: boundCats,
      unboundCats: Math.max(0, totalCats - boundCats),
      pendingSample: (pending || []).map((c) => c._id).slice(0, 5),
    };
  } catch (e) {
    out.binding = null;
  }

  // 需要真实探测时再打 MeowID（默认不查，省一次调用）
  if (args.ping) {
    try {
      const list = await meowRequest(config, 'GET', '/v1/projects/' + encodeURIComponent(config.projectId) + '/cats?limit=1', { timeout: READ_TIMEOUT_MS });
      out.meowid = {
        reachable: true,
        catsReadable: true,
        sampleCount: Array.isArray(list.body) ? list.body.length : (list.body && list.body.items ? list.body.items.length : 0),
      };
    } catch (e) {
      const err = describeMeowError(e);
      out.meowid = { reachable: err.status !== 0, catsReadable: false, code: err.code, msg: err.msg, requestId: err.requestId };
    }
  }

  return out;
}

async function countCats(ctx, query) {
  const { result } = await ctx.mpserverless.db.collection('cat').count(query);
  return result || 0;
}

// =====================================================================
// 三、每日额度
// =====================================================================
function todayStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000); // 北京时间
  return d.toISOString().slice(0, 10);
}

async function readToday(ctx, openid) {
  const { result } = await ctx.mpserverless.db.collection('recognition_log').findOne({
    openid: openid,
    date: todayStr(),
  });
  return result || { openid: openid, date: todayStr(), used: 0, bonus: 0, adCount: 0 };
}

async function checkQuota(ctx, openid, config) {
  const rec = await readToday(ctx, openid);
  const limit = config.freePerDay + (rec.bonus || 0);
  return {
    limit: limit,
    used: rec.used || 0,
    left: Math.max(0, limit - (rec.used || 0)),
    adBonus: config.adBonus,
    adEnabled: config.adEnabled,
    adCount: rec.adCount || 0,
    adLeft: Math.max(0, config.adBonusMaxPerDay - (rec.adCount || 0)),
  };
}

async function bump(ctx, openid, patch) {
  await ctx.mpserverless.db.collection('recognition_log').findOneAndUpdate(
    { openid: openid, date: todayStr() },
    { $inc: patch, $set: { openid: openid, date: todayStr(), mdate: new Date() } },
    { upsert: true }
  );
}

async function consumeQuota(ctx, openid) {
  await bump(ctx, openid, { used: 1 });
}

async function quotaAction(ctx, args) {
  const config = await loadConfig(ctx);
  if (!args.openid) {
    return { ok: false, msg: '缺少用户标识' };
  }
  const quota = await checkQuota(ctx, args.openid, config);
  return { ok: true, quota };
}

async function grantBonusAction(ctx, args) {
  const config = await loadConfig(ctx);
  if (!args.openid) {
    return { ok: false, msg: '缺少用户标识' };
  }
  // 默认关闭：客户端的广告完成回调不构成服务端凭证，绕过广告直接调本接口即可白拿次数。
  // 开启后信任级别等同于项目内徽章模块的「看广告领代币」，由管理员配置决定。
  if (!config.adEnabled) {
    return {
      ok: false,
      code: 'bonus_not_supported',
      msg: '广告奖励未开启，管理员可在识猫配置里打开',
    };
  }
  const rec = await readToday(ctx, args.openid);
  if ((rec.adCount || 0) >= config.adBonusMaxPerDay) {
    const quota = await checkQuota(ctx, args.openid, config);
    return {
      ok: false,
      code: 'bonus_exhausted',
      msg: `今日广告奖励已达上限（最多 ${config.adBonusMaxPerDay} 次）`,
      quota,
    };
  }
  await bump(ctx, args.openid, { bonus: config.adBonus, adCount: 1 });
  const quota = await checkQuota(ctx, args.openid, config);
  return { ok: true, quota: quota, bonus: config.adBonus };
}

// 管理员给自己临时加测试额度（只加「今日 bonus」，不改每日免费上限，第二天自动归零）
async function grantTestQuotaAction(ctx, args) {
  if (!(await isManager(ctx, args.openid))) {
    return { ok: false, msg: '只有管理员可以加测试额度' };
  }
  const config = await loadConfig(ctx);
  const n = Math.max(1, Math.min(50, parseInt(args.n, 10) || 10));
  await bump(ctx, args.openid, { bonus: n });
  const quota = await checkQuota(ctx, args.openid, config);
  return { ok: true, added: n, quota };
}

// =====================================================================
// 四、MeowID HTTP 客户端（零依赖：https + crypto）
// =====================================================================
async function meowSearch(config, imageBuffer) {
  let path = '/v1/projects/' + encodeURIComponent(config.projectId) + '/search?top_k=' + config.topK;
  if (config.threshold !== null && !isNaN(config.threshold)) {
    path += '&threshold=' + config.threshold;
  }
  // ⚠️ 不重试：EMAS 客户端调用硬上限 60s，一次 42s 就把预算吃得差不多了，
  // 遇 429 再等 2 次（每次最多 10s）必然被平台强杀，宁可如实报「限流，请稍后再试」。
  const response = await meowRequest(config, 'POST', path, { image: imageBuffer, timeout: RECOGNIZE_TIMEOUT_MS, retry: 0 });
  // meowRequest 返回 HTTP 包装 { body, headers, status }；识别字段在 body 内。
  // 直接把包装交给 parseSearchResult 会把每次成功命中都解析成 catCount=0。
  const body = response.body;
  if (!body || typeof body !== 'object' || !Number.isInteger(body.cat_count) || body.cat_count < 0) {
    const error = new Error('MeowID 识别响应缺少有效的 cat_count，请联系管理员检查服务');
    error.code = 'invalid_response';
    throw error;
  }
  return body;
}

// 统一请求：method/path，可选 json 体或 image（multipart，字段名固定 image）
async function meowRequest(config, method, path, options) {
  const opts = options || {};
  const url = new URL(config.baseUrl + path);
  let body = null;
  const headers = {
    'Authorization': 'Bearer ' + config.apiKey,
    'Accept': 'application/json',
  };

  if (opts.image) {
    const boundary = '----meowid' + crypto.randomBytes(12).toString('hex');
    const filename = opts.filename || 'query.jpg';
    const mime = opts.mime || 'image/jpeg';
    const head = Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="image"; filename="' + filename + '"\r\n' +
      'Content-Type: ' + mime + '\r\n\r\n'
    );
    const tail = Buffer.from('\r\n--' + boundary + '--\r\n');
    body = Buffer.concat([head, opts.image, tail]);
    headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary;
  } else if (opts.json !== undefined) {
    body = Buffer.from(JSON.stringify(opts.json));
    headers['Content-Type'] = 'application/json';
  }
  if (body) {
    headers['Content-Length'] = body.length;
  } else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    // 无请求体的写操作（如任务重试）也要显式声明长度为 0，
    // 否则 Node 可能改用 chunked 编码，部分网关会直接拒掉
    headers['Content-Length'] = 0;
  }

  const maxRetry = opts.retry === undefined ? 2 : opts.retry;
  let attempt = 0;
  for (;;) {
    const res = await httpsSend(url, method, headers, body, opts.timeout || WRITE_TIMEOUT_MS);
    if (res.status === 429 && attempt < maxRetry) {
      // 官方：遇到 429 请按 Retry-After 等待重试
      const waitSec = Math.min(10, Math.max(1, parseInt(res.headers['retry-after']) || 2));
      console.warn('[catFace] MeowID 限流，等待 ' + waitSec + 's 后重试');
      await sleep(waitSec * 1000);
      attempt++;
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      const e = new Error('MeowID HTTP ' + res.status);
      e.status = res.status;
      e.body = res.body;
      e.requestId = res.headers['x-request-id'] || '';
      throw e;
    }
    if (opts.raw) {
      return res;
    }
    let parsed = null;
    if (res.body && res.body.length) {
      try {
        parsed = JSON.parse(res.body.toString('utf8'));
      } catch (e) {
        throw new Error('MeowID 返回的不是 JSON：' + res.body.toString('utf8').slice(0, 200));
      }
    }
    return { body: parsed, headers: res.headers, status: res.status };
  }
}

function httpsSend(url, method, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: method,
      headers: headers,
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// 把官方错误码翻译成管理员能直接照做的提示
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =====================================================================
// 五、建档同步：本地 cat → MeowID 个体 + 注册图片
// =====================================================================
// 未绑定喵ID 的猫猫（字段缺失 / null / 空串都算未绑定）
function unboundQuery() {
  return {
    deleted: { $ne: 1 },
    $or: [
      { meowid_id: { $exists: false } },
      { meowid_id: null },
      { meowid_id: '' },
    ],
  };
}

async function enrollBatchAction(ctx, args) {
  if (!(await isManager(ctx, args.openid))) {
    return { ok: false, msg: '只有管理员可以执行建档同步' };
  }
  const config = await loadConfig(ctx);
  if (!config.projectId || !config.apiKey) {
    return { ok: false, code: 'not_configured', msg: '请先在 app_secret 里填写 MEOWID_PROJECT_ID 与 MEOWID_API_KEY' };
  }
  const cos = await loadCosConfig(ctx);
  if (!cos.secretId || !cos.secretKey || !cos.bucket) {
    return { ok: false, code: 'cos_not_configured', msg: '缺少腾讯云 COS 配置（OSS_BUCKET / OSS_SECRET_ID / OSS_SECRET_KEY），无法读取照片' };
  }

  const limit = Math.max(1, Math.min(10, parseInt(args.limit) || 1));
  const perCat = config.enrollImagesPerCat;
  // 整批次的绝对截止时间。EMAS 客户端调用硬上限 60s，默认留到 40s、上限锁 50s，
  // 并且这个 deadline 会一路传进 enrollOneCat，在每张照片之间检查。
  const deadlineMs = args.deadline_sec
    ? Math.max(10, Math.min(50, parseInt(args.deadline_sec, 10))) * 1000
    : config.enrollDeadlineSec * 1000;
  const deadline = Date.now() + deadlineMs;
  // 硬保护线：无论中途哪一步多慢，到点必须收手返回
  const hardDeadline = Date.now() + ENROLL_HARD_DEADLINE_MS;

  const { result: cats } = await ctx.mpserverless.db.collection('cat').find(
    unboundQuery(),
    { limit: limit, projection: { _id: 1, name: 1, nickname: 1, area: 1, colour: 1, meowid_id: 1, photo_count_best: 1 } }
  );

  const logs = [];
  let done = 0;
  let failed = 0;
  let noPhoto = 0;

  for (const cat of (cats || [])) {
    if (Date.now() > deadline) {
      logs.push({ cat_id: cat._id, name: cat.name, ok: false, code: 'out_of_time', msg: '本次时间预算用尽，剩下的下一批继续' });
      failed++;
      break;
    }
    try {
      const r = await enrollOneCat(ctx, config, cos, cat, perCat, deadline, hardDeadline);
      logs.push(r);
      if (r.ok) {
        done++;
      } else {
        failed++;
        if (r.code === 'no_photo') {
          noPhoto++;
        }
      }
    } catch (e) {
      const err = describeMeowError(e);
      console.error('[catFace] 建档失败', cat._id, JSON.stringify(err));
      logs.push({ cat_id: cat._id, name: cat.name, ok: false, code: err.code, msg: err.msg });
      failed++;
    }
    await sleep(WRITE_INTERVAL_MS);
  }

  const remaining = await countCats(ctx, unboundQuery());
  const total = await countCats(ctx, { deleted: { $ne: 1 } });
  const uploadedTotal = logs.reduce((n, l) => n + (l.uploaded || 0), 0);
  const failedPhotos = logs.reduce((n, l) => n + ((l.errors && l.errors.length) || 0), 0);
  const anyOutOfTime = logs.some((l) => l.outOfTime || l.code === 'out_of_time');

  let hint = '';
  if (noPhoto > 0) {
    hint = noPhoto + ' 只猫没有可用注册图（默认只用「精选」照片，请先在照片管理里设精选，或关掉「只用精选照片」）';
  } else if (anyOutOfTime) {
    hint = '有猫没处理完：时间预算用尽。把「每次数量」调小、或把注册图数量调小后继续';
  } else if (failedPhotos > 0) {
    hint = '有照片上传失败，见 logs[].errors 里的具体原因';
  }

  return {
    ok: true,
    processed: logs.length,
    done: done,
    failed: failed,
    uploadedPhotos: uploadedTotal,
    failedPhotos: failedPhotos,
    logs: logs,
    progress: { total: total, remaining: remaining, bound: Math.max(0, total - remaining) },
    hint: hint,
  };
}

// 给单只猫建档：无 meowid_id 则先创建个体，再上传注册图（已传过的自动跳过）
// deadline：整批次的绝对截止时间戳（毫秒）。**每张照片之间**都要检查，
// 逼近截止就停下如实报告，绝不硬撑到云函数被强杀（那会导致记录全丢 + 重复计费）。
async function enrollOneCat(ctx, config, cos, cat, perCat, deadline, hardDeadline, onlyBestOverride) {
  const pid = encodeURIComponent(config.projectId);
  const onlyBest = onlyBestOverride === undefined ? !!config.enrollOnlyBest : !!onlyBestOverride;
  let meowId = cat.meowid_id;

  if (!meowId) {
    // 建个体最坏要 WRITE_TIMEOUT_MS，塞不进硬截止就别开工（否则会被云函数强杀）
    if (!canAffordOp(Date.now(), hardDeadline, WRITE_TIMEOUT_MS)) {
      return { cat_id: cat._id, name: cat.name, ok: false, code: 'out_of_time', msg: '时间预算用尽，这次没有创建个体，下一批继续' };
    }
    const created = await meowRequest(config, 'POST', '/v1/projects/' + pid + '/cats', {
      json: {
        name: (cat.name || cat.nickname || cat._id).slice(0, 100),
        metadata: { local_id: cat._id, area: cat.area || '', colour: cat.colour || '' },
        active: true,
      },
      // 不重试：60s 预算下多等一轮就可能被平台强杀，失败就让用户重跑
      retry: 0,
    });
    const b = created.body || {};
    meowId = b.id || b.cat_id || b._id || (b.data && b.data.id) || (b.cat && b.cat.id) || '';
    if (!meowId) {
      return { cat_id: cat._id, name: cat.name, ok: false, code: 'no_id_returned', msg: '创建个体成功但没拿到 id：' + JSON.stringify(b).slice(0, 200) };
    }
    // 立刻落库，避免后续超时导致「个体建好了但本地没记录」→ 重跑又建一个
    await ctx.mpserverless.db.collection('cat').updateOne(
      { _id: cat._id },
      { $set: { meowid_id: meowId, meowid_name: cat.name || '', meowid_bound_at: new Date() } }
    );
  }

  // 选注册图。
  // 默认只用「精选」（best=true）——精选是人工挑过的最佳正脸照，直接决定识别率。
  // 关掉 MEOWID_ENROLL_ONLY_BEST（写 '0'）后退回「所有过审照片，精选优先」。
  const pool = await countPhotoPool(ctx, cat._id);
  const { result: photos } = await ctx.mpserverless.db.collection('photo').find(
    onlyBest
      ? { cat_id: cat._id, verified: true, best: true }
      : { cat_id: cat._id, verified: true },
    { limit: 20, sort: { best: -1, mdate: -1 }, projection: { _id: 1, photo_id: 1, photo_compressed: 1, best: 1 } }
  );

  const uploaded = [];
  const skipped = [];
  const errors = [];
  const candidates = (photos || []).slice(0, perCat);
  const photoStat = { verified: pool.verified, best: pool.best, chosen: candidates.length };

  if (candidates.length === 0) {
    const msg = onlyBest
      ? ('该猫没有「精选」照片可用（过审 ' + pool.verified + ' 张，精选 0 张），注册图没传。请先在照片管理里把好照片设为精选，或关掉「只用精选照片」再试')
      : ('该猫没有过审照片可用（过审 0 张），注册图没传');
    return { cat_id: cat._id, name: cat.name, meowid_id: meowId, ok: false, code: 'no_photo', uploaded: 0, photos: photoStat, errors: [], msg };
  }

  // 已经传过的照片不再重复上传（省一次计费）
  const { result: catDoc } = await ctx.mpserverless.db.collection('cat').findOne({ _id: cat._id });
  let history = (catDoc && catDoc.meowid_images) || [];
  const doneIds = new Set(history.filter((h) => h && h.task_id).map((h) => String(h.photo_id)));

  // 每处理完一张就立刻落库。原来只在循环结束后写一次，
  // 中途超时会让所有记录丢失，重跑还会把已传过的图再传一遍（重复计费）。
  const flush = async () => {
    history = history.slice(-30);
    await ctx.mpserverless.db.collection('cat').updateOne({ _id: cat._id }, { $set: { meowid_images: history } });
  };

  let outOfTime = false;
  for (const photo of candidates) {
    if (doneIds.has(String(photo._id))) {
      skipped.push(photo._id);
      continue;
    }
    if (deadline && Date.now() > deadline) {
      outOfTime = true;
      break;
    }
    // 硬保护：下一张照片最坏要「下载 + 上传」两段满额时间，
    // 凑不齐就停在这里如实报告，绝不硬撑到被云函数强杀
    if (!canAffordOp(Date.now(), hardDeadline, PHOTO_DOWNLOAD_TIMEOUT_MS + WRITE_TIMEOUT_MS)) {
      outOfTime = true;
      break;
    }
    try {
      const buf = await fetchPhotoBuffer(cos, photo, config);
      if (buf.length > MEOWID_MAX_IMAGE_BYTES) {
        const msg = '图片超过 MeowID 的 15MiB 上限（' + Math.round(buf.length / 1024 / 1024) + 'MiB），请换一张压缩图';
        errors.push({ photo_id: photo._id, msg: msg });
        history.push({ photo_id: photo._id, task_id: '', status: 'failed', error: msg, at: new Date() });
        await flush();
        continue;
      }
      if ((deadline && Date.now() > deadline) || !canAffordOp(Date.now(), hardDeadline, WRITE_TIMEOUT_MS)) {
        outOfTime = true;
        break;
      }
      const res = await meowRequest(config, 'POST', '/v1/projects/' + pid + '/cats/' + encodeURIComponent(meowId) + '/images', {
        image: buf,
        filename: 'enroll.jpg',
        mime: 'image/jpeg',
        timeout: WRITE_TIMEOUT_MS,
        // 同样不重试：150ms 间隔已远低于官方 10 次/秒写限流，遇 429 极罕见；
        // 真失败就记下来、下次补（已传过的照片有去重，不会重复计费）。
        retry: 0,
      });
      const taskId = (res.body && (res.body.task_id || res.body.id)) || '';
      history.push({
        photo_id: photo._id,
        task_id: taskId,
        status: (res.body && res.body.status) || 'queued',
        at: new Date(),
      });
      uploaded.push(photo._id);
      await flush();
      await sleep(WRITE_INTERVAL_MS);
    } catch (e) {
      const err = describeMeowError(e);
      errors.push({ photo_id: photo._id, code: err.code, msg: err.msg });
      history.push({ photo_id: photo._id, task_id: '', status: 'failed', error: err.msg, at: new Date() });
      await flush();
      console.error('[catFace] 上传注册图失败', cat._id, photo._id, JSON.stringify(err));
    }
  }

  // 「有东西登记了」才算成功：要么这次传了，要么之前就传过（skipped）
  const ok = uploaded.length > 0 || (skipped.length > 0 && errors.length === 0 && !outOfTime);
  let msg;
  if (uploaded.length) {
    msg = '已上传 ' + uploaded.length + ' 张注册图' + (outOfTime ? '（时间预算用尽，剩余照片下次继续）' : '');
  } else if (skipped.length && !errors.length && !outOfTime) {
    msg = '没有新的照片需要上传';
  } else if (outOfTime) {
    msg = '时间预算用尽，注册图没传完；请把每次数量调小后重试';
  } else {
    msg = '注册图上传失败：' + (errors.length ? errors[0].msg : '未知原因');
  }

  return {
    cat_id: cat._id,
    name: cat.name,
    meowid_id: meowId,
    ok: ok,
    uploaded: uploaded.length,
    skipped: skipped.length,
    photos: photoStat,
    errors: errors,
    outOfTime: outOfTime,
    msg: msg,
  };
}

// 对「指定的某一只猫」补传注册图 —— 包含已经建过档的猫。
// enrollBatch 只挑未绑定的猫，所以「已绑定但参考图不全 / 想补新精选」的猫一直没有入口。
// 内部复用 enrollOneCat：没有 meowid_id 就先建个体，已传过的照片自动跳过（不会重复计费）。
//   args.cat_id     必填
//   args.dry_run    true 时只预览「要传几张、跳过几张」，不建个体、不上传、不计费
//   args.only_best  覆盖「只用精选」策略（默认跟随配置）；传 false 表示所有过审照片
//   args.per_cat    本次最多传几张（默认跟随配置）
async function enrollCatAction(ctx, args) {
  if (!(await isManager(ctx, args.openid))) {
    return { ok: false, msg: '只有管理员可以补传注册图' };
  }
  const catId = String(args.cat_id || '').trim();
  if (!catId) {
    return { ok: false, code: 'no_cat_id', msg: '请先填写要补传的猫 ID' };
  }
  const config = await loadConfig(ctx);
  if (!config.projectId || !config.apiKey) {
    return { ok: false, code: 'not_configured', msg: '请先在 app_secret 里填写 MEOWID_PROJECT_ID 与 MEOWID_API_KEY' };
  }

  const { result: cat } = await ctx.mpserverless.db.collection('cat').findOne({ _id: catId });
  if (!cat) {
    return { ok: false, code: 'cat_not_found', msg: '本地没有这只猫：' + catId };
  }
  if (cat.deleted === 1) {
    return { ok: false, code: 'cat_deleted', msg: '这只猫已删除，不能建档' };
  }

  // 本次策略：显式传 only_best 优先，否则跟随配置
  let onlyBest = !!config.enrollOnlyBest;
  if (args.only_best !== undefined) {
    onlyBest = !(args.only_best === false || args.only_best === '0' || args.only_best === 0 || args.only_best === 'false');
  }
  const perCat = Math.max(1, Math.min(10, parseInt(args.per_cat, 10) || config.enrollImagesPerCat));

  // 先算差异：这只猫有哪些可用照片、其中哪些已经登记过
  const pool = await countPhotoPool(ctx, cat._id);
  const { result: photos } = await ctx.mpserverless.db.collection('photo').find(
    onlyBest ? { cat_id: cat._id, verified: true, best: true } : { cat_id: cat._id, verified: true },
    { limit: 20, sort: { best: -1, mdate: -1 }, projection: { _id: 1, photo_compressed: 1, best: 1 } }
  );
  const doneIds = new Set((cat.meowid_images || []).filter((h) => h && h.task_id).map((h) => String(h.photo_id)));
  const candidates = (photos || []).slice(0, perCat);
  const pending = candidates.filter((p) => !doneIds.has(String(p._id)));
  const preview = {
    cat_id: cat._id,
    name: cat.name,
    meowid_id: cat.meowid_id || '',
    bound: !!cat.meowid_id,
    onlyBest: onlyBest,
    perCat: perCat,
    pool: pool,
    chosen: candidates.length,
    alreadyRegistered: candidates.length - pending.length,
    pending: pending.map((p) => String(p._id)),
  };

  if (args.dry_run) {
    let hint;
    if (candidates.length === 0) {
      hint = onlyBest
        ? ('这只猫没有「精选」照片可用（过审 ' + pool.verified + ' 张，精选 0 张）。先到照片管理里把好照片设为精选，或关掉「只用精选」再补传')
        : '这只猫没有过审照片可用';
    } else if (pending.length === 0) {
      hint = '需要传的 ' + candidates.length + ' 张都已经登记过了，不用重复上传';
    } else {
      hint = '本次会传 ' + pending.length + ' 张，跳过已登记的 ' + preview.alreadyRegistered + ' 张'
        + (preview.bound ? '' : '，并会先在 MeowID 创建一个新个体');
    }
    return { ok: true, dryRun: true, preview: preview, hint: hint };
  }

  const cos = await loadCosConfig(ctx);
  if (!cos.secretId || !cos.secretKey || !cos.bucket) {
    return { ok: false, code: 'cos_not_configured', msg: '缺少腾讯云 COS 配置（OSS_BUCKET / OSS_SECRET_ID / OSS_SECRET_KEY），无法读取照片' };
  }

  // 单只猫补传也走同一套双闸门，绝不硬撑到被云函数强杀
  const startedAt = Date.now();
  const deadline = startedAt + config.enrollDeadlineSec * 1000;
  const hardDeadline = startedAt + ENROLL_HARD_DEADLINE_MS;
  const log = await enrollOneCat(ctx, config, cos, cat, perCat, deadline, hardDeadline, onlyBest);
  return {
    ok: !!log.ok,
    dryRun: false,
    preview: preview,
    log: log,
    uploadedPhotos: log.uploaded || 0,
    failedPhotos: (log.errors && log.errors.length) || 0,
    hint: log.msg,
  };
}

// 统计某只猫的照片池：过审数 / 精选数。
// 用途：把「为什么没有图可用」变成一句能照做的提示，而不是让管理员猜。
async function countPhotoPool(ctx, catId) {
  try {
    const { result: verified } = await ctx.mpserverless.db.collection('photo').count({ cat_id: catId, verified: true });
    const { result: best } = await ctx.mpserverless.db.collection('photo').count({ cat_id: catId, verified: true, best: true });
    return { verified: verified || 0, best: best || 0 };
  } catch (e) {
    console.warn('[catFace] 统计照片池失败', catId, e && e.message);
    return { verified: 0, best: 0 };
  }
}

// 手动绑定/解绑（个体 id 在 MeowID 控制台个体列表里）
async function bindAction(ctx, args) {
  if (!(await isManager(ctx, args.openid))) {
    return { ok: false, msg: '只有管理员可以绑定' };
  }
  if (!args.cat_id || !args.meowid_id) {
    return { ok: false, msg: '缺少 cat_id 或 meowid_id' };
  }
  await ctx.mpserverless.db.collection('cat').updateOne(
    { _id: args.cat_id },
    { $set: { meowid_id: String(args.meowid_id), meowid_bound_at: new Date() } }
  );
  return { ok: true };
}

async function unbindAction(ctx, args) {
  if (!(await isManager(ctx, args.openid))) {
    return { ok: false, msg: '只有管理员可以解绑' };
  }
  if (!args.cat_id) {
    return { ok: false, msg: '缺少 cat_id' };
  }
  await ctx.mpserverless.db.collection('cat').updateOne(
    { _id: args.cat_id },
    { $unset: { meowid_id: '', meowid_images: '' } }
  );
  return { ok: true };
}

// 拉取注册任务状态，回写本地 meowid_images
async function syncTasksAction(ctx, args) {
  if (!(await isManager(ctx, args.openid))) {
    return { ok: false, msg: '只有管理员可以同步任务' };
  }
  const config = await loadConfig(ctx);
  if (!config.projectId || !config.apiKey) {
    return { ok: false, code: 'not_configured', msg: '请先配置 MeowID 项目信息' };
  }
  let res;
  try {
    res = await meowRequest(config, 'GET', '/v1/projects/' + encodeURIComponent(config.projectId) + '/tasks?limit=100&offset=0', {
      timeout: READ_TIMEOUT_MS,
    });
  } catch (e) {
    const err = describeMeowError(e);
    return { ok: false, code: err.code, msg: err.msg };
  }
  const list = Array.isArray(res.body) ? res.body : ((res.body && res.body.items) || []);
  const statusById = {};
  for (const t of list) {
    if (t && t.id) {
      statusById[t.id] = t.status || '';
    }
  }

  const { result: cats } = await ctx.mpserverless.db.collection('cat').find(
    { meowid_id: { $nin: [null, ''] } },
    { limit: 200, projection: { _id: 1, meowid_images: 1 } }
  );
  let updated = 0;
  let waiting = 0;
  let failed = 0;
  for (const cat of (cats || [])) {
    const imgs = cat.meowid_images || [];
    let changed = false;
    for (const img of imgs) {
      const st = img && img.task_id ? statusById[img.task_id] : '';
      if (st && st !== img.status) {
        img.status = st;
        changed = true;
      }
      if (img.status === 'waiting_user') {
        waiting++;
      }
      if (img.status === 'failed') {
        failed++;
      }
    }
    if (changed) {
      await ctx.mpserverless.db.collection('cat').updateOne({ _id: cat._id }, { $set: { meowid_images: imgs } });
      updated++;
    }
  }
  return {
    ok: true,
    tasks: list.length,
    updatedCats: updated,
    waiting: waiting,
    failed: failed,
    hint: waiting > 0 ? '有照片里检测到多只猫，需要到 MeowID 控制台为这些任务选择目标猫' : '',
  };
}

// 重试失败的建档任务
// 官方：POST /v1/projects/{project_id}/tasks/{task_id}/retry，需要 cats:write 或 recognition:write，
//       只有 failed 状态且保留了源数据的任务可重试，成功返回 202。
// 三种用法：
//   1) 传 task_id            → 只重试这一个（可同时传 cat_id 以便回写本地状态）
//   2) 传 cat_id             → 重试这只猫名下所有 failed 任务
//   3) 都不传                → 重试本地记录里全部 failed 任务（受 limit 限制，默认 10，最多 30）
async function retryTaskAction(ctx, args) {
  if (!(await isManager(ctx, args.openid))) {
    return { ok: false, msg: '只有管理员可以重试任务' };
  }
  const config = await loadConfig(ctx);
  if (!config.projectId || !config.apiKey) {
    return { ok: false, code: 'not_configured', msg: '请先配置 MeowID 项目信息' };
  }

  const pid = encodeURIComponent(config.projectId);
  const targets = [];

  if (args.task_id) {
    targets.push({ cat_id: String(args.cat_id || ''), task_id: String(args.task_id) });
  } else {
    const query = args.cat_id
      ? { _id: String(args.cat_id) }
      : { meowid_id: { $nin: [null, ''] } };
    const { result: cats } = await ctx.mpserverless.db.collection('cat').find(
      query,
      { limit: 300, projection: { _id: 1, name: 1, meowid_images: 1 } }
    );
    for (const c of (cats || [])) {
      for (const img of (c.meowid_images || [])) {
        if (img && img.task_id && img.status === 'failed') {
          targets.push({ cat_id: c._id, name: c.name, task_id: String(img.task_id) });
        }
      }
    }
  }

  if (targets.length === 0) {
    return { ok: true, total: 0, attempted: 0, retried: 0, failed: 0, results: [], msg: '没有失败状态的任务需要重试' };
  }

  const max = Math.max(1, Math.min(30, parseInt(args.limit, 10) || 10));
  const list = targets.slice(0, max);

  const results = [];
  let retried = 0;
  let failCount = 0;
  for (const t of list) {
    try {
      const res = await meowRequest(
        config,
        'POST',
        '/v1/projects/' + pid + '/tasks/' + encodeURIComponent(t.task_id) + '/retry',
        { timeout: WRITE_TIMEOUT_MS }
      );
      // 官方只说「成功返回 202」，这里把 2xx 都当成已受理，避免不同网关返回 200 时误判失败
      if (res.status >= 200 && res.status < 300) {
        if (t.cat_id) {
          await markTaskStatus(ctx, t.cat_id, t.task_id, 'queued');
        }
        retried++;
        results.push({ task_id: t.task_id, cat_id: t.cat_id, ok: true, httpStatus: res.status });
      } else {
        failCount++;
        results.push({ task_id: t.task_id, cat_id: t.cat_id, ok: false, httpStatus: res.status, msg: 'MeowID 返回 HTTP ' + res.status });
      }
    } catch (e) {
      const err = describeMeowError(e);
      failCount++;
      results.push({ task_id: t.task_id, cat_id: t.cat_id, ok: false, code: err.code, msg: err.msg, httpStatus: err.status });
      console.error('[catFace] 重试任务失败', t.task_id, JSON.stringify(err));
    }
    await sleep(WRITE_INTERVAL_MS);
  }

  return {
    ok: true,
    total: targets.length,
    attempted: list.length,
    retried: retried,
    failed: failCount,
    results: results,
    hint: targets.length > list.length
      ? ('本次只处理了前 ' + list.length + ' 个，仍有 ' + (targets.length - list.length) + ' 个失败任务，可再次点击重试')
      : (retried > 0 ? '已重新排队，稍后用「同步任务状态」查看结果' : ''),
  };
}

// 把单条登记记录的状态改掉（重试成功后 failed → queued）
async function markTaskStatus(ctx, catId, taskId, status) {
  const { result: catDoc } = await ctx.mpserverless.db.collection('cat').findOne({ _id: catId });
  const imgs = (catDoc && catDoc.meowid_images) || [];
  let changed = false;
  for (const img of imgs) {
    if (img && String(img.task_id) === String(taskId)) {
      img.status = status;
      img.retied_at = new Date();
      changed = true;
    }
  }
  if (changed) {
    await ctx.mpserverless.db.collection('cat').updateOne({ _id: catId }, { $set: { meowid_images: imgs } });
  }
  return changed;
}

// 查看某只猫的建档参考图
// 官方：GET /v1/projects/{project_id}/cats/{cat_id}/images（需要 cats:read）
//       另有 GET .../images/{image_id}/content 可取原图二进制，但那是图片流不适合经云函数回传，
//       所以这里改成本地预览：MeowID 的参考图本来就是由本地 COS 照片上传的，
//       直接把对应的本地照片地址带回去给前端签名展示，结果等价且不用搬运二进制。
async function catImagesAction(ctx, args) {
  if (!(await isManager(ctx, args.openid))) {
    return { ok: false, msg: '只有管理员可以查看参考图' };
  }
  const config = await loadConfig(ctx);
  if (!config.projectId || !config.apiKey) {
    return { ok: false, code: 'not_configured', msg: '请先配置 MeowID 项目信息' };
  }
  const catId = String(args.cat_id || '').trim();
  if (!catId) {
    return { ok: false, msg: '请填写猫 ID' };
  }

  const { result: catDoc } = await ctx.mpserverless.db.collection('cat').findOne({ _id: catId });
  if (!catDoc) {
    return { ok: false, msg: '找不到这只猫：' + catId };
  }

  // 照片池统计：不管有没有绑定个体都先算出来。
  // 这就是「为什么没传上注册图」的答案来源——默认只用精选照片，
  // 如果精选是 0，建档必然一张都传不上去。
  const pool = await countPhotoPool(ctx, catId);
  const poolInfo = {
    verified: pool.verified,
    best: pool.best,
    onlyBest: config.enrollOnlyBest,
    hint: pool.best === 0
      ? (pool.verified > 0
        ? '这只猫有 ' + pool.verified + ' 张过审照片，但没有一张是「精选」，默认不会拿来建档'
        : '这只猫还没有任何过审照片，无法建档')
      : ('可用注册图 ' + (config.enrollOnlyBest ? pool.best : pool.verified) + ' 张'),
  };

  const meowId = catDoc.meowid_id || '';
  if (!meowId) {
    // 未绑定也返回照片池：这正是建档失败时最需要看的信息
    return {
      ok: true,
      cat_id: catId,
      name: catDoc.name || '',
      meowid_id: '',
      pool: poolInfo,
      remoteCount: 0,
      remote: [],
      remoteError: null,
      local: [],
      counts: { done: 0, failed: 0, waiting_user: 0, total: 0 },
      hint: '这只猫还没有绑定 MeowID 个体（还没建档）。' + poolInfo.hint,
    };
  }

  const pid = encodeURIComponent(config.projectId);
  let remoteRaw = null;
  let remoteError = null;
  try {
    const res = await meowRequest(
      config,
      'GET',
      '/v1/projects/' + pid + '/cats/' + encodeURIComponent(meowId) + '/images',
      { timeout: READ_TIMEOUT_MS }
    );
    remoteRaw = res.body;
  } catch (e) {
    const err = describeMeowError(e);
    remoteError = { code: err.code, msg: err.msg, requestId: err.requestId };
    console.error('[catFace] 拉取参考图列表失败', catId, JSON.stringify(err));
  }

  // 官方文档没给这个接口的响应体示例，所以三种常见形态都兼容：数组 / {items:[]} / {images:[]}
  let remoteList = [];
  if (Array.isArray(remoteRaw)) {
    remoteList = remoteRaw;
  } else if (remoteRaw && Array.isArray(remoteRaw.items)) {
    remoteList = remoteRaw.items;
  } else if (remoteRaw && Array.isArray(remoteRaw.images)) {
    remoteList = remoteRaw.images;
  }
  const remote = remoteList.map((it) => ({
    image_id: it && (it.id || it.image_id) || '',
    status: it && (it.status || '') || '',
    is_primary: it ? !!it.is_primary : false,
    created_at: it && (it.created_at || it.createdAt || '') || '',
  }));

  // 本地登记记录：task 状态 + 用的是哪张本地照片
  const history = catDoc.meowid_images || [];
  const photoIds = history.map((h) => h && h.photo_id).filter(Boolean);
  let photos = [];
  if (photoIds.length) {
    const { result: list } = await ctx.mpserverless.db.collection('photo').find(
      { _id: { $in: photoIds } },
      { projection: { _id: 1, photo_id: 1, photo_compressed: 1, verified: 1, best: 1 } }
    );
    photos = list || [];
  }
  const photoMap = {};
  for (const p of photos) {
    photoMap[String(p._id)] = p;
  }
  // 参考图是使用 enrollUseOriginal 决定的那一版上传的，预览地址要跟上传时保持一致
  const pickUrl = (p) => (config.enrollUseOriginal
    ? (p.photo_id || p.photo_compressed)
    : (p.photo_compressed || p.photo_id));

  const local = history.map((h) => {
    const p = photoMap[String(h && h.photo_id)] || null;
    return {
      photo_id: h && h.photo_id ? String(h.photo_id) : '',
      task_id: (h && h.task_id) || '',
      status: (h && h.status) || '',
      url: p ? (pickUrl(p) || '') : '',
      best: p ? !!p.best : false,
      verified: p ? !!p.verified : false,
    };
  });

  // 与前端展示相关的统计
  let donePhotos = 0;
  let failedPhotos = 0;
  let waitingPhotos = 0;
  for (const l of local) {
    if (l.status === 'completed') donePhotos++;
    else if (l.status === 'failed') failedPhotos++;
    else if (l.status === 'waiting_user') waitingPhotos++;
  }

  return {
    ok: true,
    cat_id: catId,
    name: catDoc.name || '',
    meowid_id: meowId,
    remoteCount: remote.length,
    remote: remote,
    remoteError: remoteError,
    pool: poolInfo,
    local: local,
    counts: { done: donePhotos, failed: failedPhotos, waiting_user: waitingPhotos, total: local.length },
    hint: remoteError
      ? '读取远端参考图失败，下面只显示本地登记记录'
      : (remote.length < donePhotos
        ? '远端参考图数量少于本地成功数，可能有图片被删除或未生效'
        : poolInfo.hint),
  };
}

// 管理员写入识猫配置（只允许白名单字段，不会碰到 OSS_* 等已有密钥）
// 用途一：在 EMAS 控制台「代码执行」里传参写入，省得手改 app_secret 记录的 JSON；
// 用途二：以后可以在小程序管理后台做表单直接调用。
// 注意：openid 已由入口覆盖为平台验证的调用者；返回值只回字段名，不回显任何密钥。
async function saveConfigAction(ctx, args) {
  if (!(await isManager(ctx, args.openid))) {
    return { ok: false, msg: '只有管理员可以修改配置' };
  }
  const data = args.data || {};
  const allow = [
    'MEOWID_BASE_URL', 'MEOWID_PROJECT_ID', 'MEOWID_API_KEY',
    'MEOWID_TOP_K', 'MEOWID_THRESHOLD',
    'MEOWID_ENROLL_IMAGES_PER_CAT', 'MEOWID_ENROLL_USE_ORIGINAL',
    'MEOWID_ENROLL_ONLY_BEST', 'MEOWID_ENROLL_DEADLINE_SEC',
    'RECOGNIZE_FREE_PER_DAY', 'RECOGNIZE_AD_BONUS',
    'RECOGNIZE_AD_ENABLED', 'RECOGNIZE_AD_BONUS_MAX_PER_DAY',
  ];
  const patch = {};
  for (const k of allow) {
    const v = data[k];
    if (v === undefined || v === null) {
      continue;
    }
    // 注意：`''` 和 `0` 都是有效值。写空字符串用于「清空该配置、回到模型默认」，
    // 阈值 0 也要能写进去，所以这里不能简单地把空值一律跳过。
    patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, msg: '没有可写入的字段（允许：' + allow.join('、') + '）' };
  }
  const { result: doc } = await ctx.mpserverless.db.collection('app_secret').findOne();
  if (!doc || !doc._id) {
    return { ok: false, msg: 'app_secret 集合里没有记录，请先在控制台新建一条' };
  }
  await ctx.mpserverless.db.collection('app_secret').updateOne({ _id: doc._id }, { $set: patch });
  // 只回字段名，绝不回显字段值
  return {
    ok: true,
    updated: Object.keys(patch),
    updatedCount: Object.keys(patch).length,
    docId: doc._id,
  };
}

// =====================================================================
// 六、识别效果诊断（只读）
// =====================================================================
// 用途：识别总是「暂时没认出这是哪只猫」时，用真实注册图当查询图打一次 search，
// 把 MeowID 返回的 route / matches[].score / unknown 原样带回来，用来判断
// 到底是「阈值定太高」还是「注册图质量不行」。只读，不写任何数据，不回显密钥。
async function diagnoseAction(ctx, args) {
  if (!(await isManager(ctx, args.openid))) {
    return { ok: false, msg: '只有管理员可以诊断' };
  }
  const config = await loadConfig(ctx);
  if (!config.projectId || !config.apiKey) {
    return { ok: false, code: 'not_configured', msg: '请先配置 MeowID 项目信息' };
  }

  const limit = Math.max(1, Math.min(5, parseInt(args.limit, 10) || 2));
  const base = '/v1/projects/' + encodeURIComponent(config.projectId);
  const filter = args.cat_id
    ? { _id: args.cat_id, meowid_id: { $nin: [null, ''] } }
    : { deleted: { $ne: 1 }, meowid_id: { $nin: [null, ''] } };
  const { result: cats } = await ctx.mpserverless.db.collection('cat').find(
    filter,
    { limit: limit, projection: { _id: 1, name: 1, meowid_id: 1, photo_count_best: 1 } }
  );

  const out = [];
  // 诊断要逐只猫打多次请求（列表 + 取图 + 两次识别），单只最坏就 100s+，
  // 而 EMAS 客户端调用硬上限只有 60s。所以这里也挂一条硬截止线：
  // 到点就把已采到的部分原样返回，并在 note 里说明「本次没测完」。
  const hardDeadline = Date.now() + ENROLL_HARD_DEADLINE_MS;
  for (const cat of (cats || [])) {
    const item = {
      name: cat.name || '',
      cat_id: cat._id,
      photos: cat.photo_count_best || 0,
      registered: 0,
      searchable: 0,
      route: '',
      unknown: null,
      catCount: null,
      scores: [],
      top: [],
    };
    if (Date.now() > hardDeadline) {
      item.error = 'time_budget: 本次 60s 预算不足以测完这只猫，请缩小 limit 或稍后重试';
      out.push(item);
      continue;
    }
    try {
      const listRes = await meowRequest(config, 'GET', base + '/cats/' + encodeURIComponent(cat.meowid_id) + '/images', {
        timeout: READ_TIMEOUT_MS,
      });
      const imgs = Array.isArray(listRes.body) ? listRes.body : ((listRes.body && listRes.body.items) || []);
      item.registered = imgs.length;
      item.searchable = imgs.filter((i) => i && (i.vectors_added === undefined || Number(i.vectors_added) > 0)).length;
      const imgId = (imgs[0] && (imgs[0].id || imgs[0].image_id)) || '';
      if (imgId) {
        const content = await meowRequest(
          config, 'GET',
          base + '/cats/' + encodeURIComponent(cat.meowid_id) + '/images/' + encodeURIComponent(imgId) + '/content',
          { timeout: READ_TIMEOUT_MS, raw: true }
        );
        if (content.body && content.body.length) {
          const sha = crypto.createHash('sha256').update(content.body).digest('hex');
          item.contentBytes = content.body.length;
          item.contentSha = sha.slice(0, 16);
          item.contentHead = content.body.subarray(0, 4).toString('hex');
          const meow = await meowSearch(config, content.body);
          const parsed = parseSearchResult(meow);
          item.route = parsed.route;
          item.unknown = parsed.unknown;
          item.catCount = parsed.catCount;
          item.scores = parsed.matches.map((m) => m.score);
          item.top = parsed.matches.slice(0, 3).map((m) => ({ name: m.name, score: m.score, support: m.support }));
          // 原始响应骨架：不依赖云端日志也能看清 MeowID 到底回了什么
          const raw = (meow && typeof meow === 'object') ? meow : {};
          item.rawKeys = Object.keys(raw).slice(0, 20);
          item.rawCatCount = raw.cat_count;
          item.rawUnknown = raw.unknown;
          item.rawMatchesLen = Array.isArray(raw.matches) ? raw.matches.length : -1;
          item.rawCandidatesLen = Array.isArray(raw.candidates) ? raw.candidates.length : -1;
          item.rawSnippet = JSON.stringify(raw).slice(0, 300);
          // 同图换 JSON+base64 格式再打一次：用来判断问题在「请求格式」还是「网络层」。
          // 这一发是「附加诊断」，预算不够就跳过，保证函数能及时返回。
          try {
            if (!canAffordOp(Date.now(), hardDeadline, RECOGNIZE_TIMEOUT_MS)) {
              item.jsonSkipped = 'time_budget: 剩余预算不足，跳过 JSON 格式二次校验';
              out.push(item);
              break;
            }
            const meow2 = await meowRequest(
              config, 'POST',
              '/v1/projects/' + encodeURIComponent(config.projectId) + '/search?top_k=' + config.topK,
              { json: { image: content.body.toString('base64') }, timeout: RECOGNIZE_TIMEOUT_MS, retry: 0 }
            );
            const raw2 = (meow2.body && typeof meow2.body === 'object') ? meow2.body : {};
            item.jsonCatCount = raw2.cat_count;
            item.jsonSnippet = JSON.stringify(raw2).slice(0, 200);
          } catch (e2) {
            item.jsonError = describeMeowError(e2).code + ':' + describeMeowError(e2).msg;
          }
        }
      }
    } catch (e) {
      const err = describeMeowError(e);
      item.error = err.code + ':' + err.msg;
    }
    out.push(item);
  }

  return {
    ok: true,
    data: {
      threshold: config.threshold,
      topK: config.topK,
      perCat: out,
    },
  };
}

// =====================================================================
// 七、从腾讯云 COS 读图（纯 crypto 实现 COS v5 签名，不引 SDK）
// =====================================================================
async function fetchPhotoBuffer(cos, photo, config) {
  const url = config.enrollUseOriginal
    ? (photo.photo_id || photo.photo_compressed)
    : (photo.photo_compressed || photo.photo_id);
  if (!url) {
    throw new Error('这张照片还没有可用的图片地址（photo_compressed / photo_id 均为空）');
  }
  const signed = cosSignIfNeeded(url, cos, 600);
  const buf = await httpsGetBuffer(signed.url, signed.headers, PHOTO_DOWNLOAD_TIMEOUT_MS);
  if (!buf || buf.length === 0) {
    throw new Error('下载照片失败，返回内容为空');
  }
  return buf;
}

function cosSignIfNeeded(url, cos, expiresSec) {
  // 已经是签名过的地址（带 q-signature）直接返回：再签一次会因为
  // q-url-param-list 与实际查询串对不上而 403
  if (typeof url === 'string' && /[?&]q-signature=/.test(url)) {
    return { url: url, headers: {} };
  }
  const parsed = parseCosUrl(url);
  if (!parsed || !cos.secretId || !cos.secretKey) {
    // 非 COS 地址或没配密钥（公开桶）时按原样访问
    return { url: url, headers: {} };
  }
  // 关键：请求地址必须与签名内容一致。签名用的是无查询串的路径，
  // 所以发送时也要把查询串去掉（客户端 utils/common.js 的 signCosUrl
  // 同样是先 removeQueryParams 再签名）。
  // 之前这里是「签无查询串的路径、发带查询串的完整地址」，只要照片地址
  // 带 ?imageMogr2/... 之类的处理参数，签名就一定校验失败（403），
  // 结果就是「个体建好了，注册图一张也传不上去」。
  const cleanUrl = String(url).split('?')[0].split('#')[0];
  // 与官方 SDK 一致：起始时间往前挪 1 秒，容忍服务器与本地时钟的偏差
  const now = Math.floor(Date.now() / 1000) - 1;
  const keyTime = now + ';' + (now + (expiresSec || 600));
  const authorization = buildCosAuthorization({
    secretKey: cos.secretKey,
    secretId: cos.secretId,
    host: parsed.host,
    // 注意：签名用的是「解码后」的路径（官方 SDK 传的是原始 Key），
    // 而请求本身发的是 URL 里编码后的路径，COS 侧会解码后再校验签名。
    pathname: parsed.signPath,
    keyTime: keyTime,
  });
  return { url: cleanUrl, headers: { Authorization: authorization } };
}

// COS v5 请求签名（与 cos-js-sdk-v5 / cos-wx-sdk-v5 的 getAuth 等价）
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

// 与 SDK 的 camSafeUrlEncode 保持一致
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

// 便于本地跑单元测试（不参与线上逻辑）
module.exports.__internals = {
  parseSearchResult,
  pickMatchNode,
  buildResults,
  normalizeMatches,
  pickBox,
  describeMeowError,
  cosSignIfNeeded,
  parseCosUrl,
  buildCosAuthorization,
  canAffordOp,
  CLIENT_REQUEST_HARD_LIMIT_MS,
  RECOGNIZE_TIMEOUT_MS,
  ENROLL_HARD_DEADLINE_MS,
  ENROLL_DEADLINE_MS,
  READ_TIMEOUT_MS,
  WRITE_TIMEOUT_MS,
  PHOTO_DOWNLOAD_TIMEOUT_MS,
};

// 简单 GET（跟随 302，最多 3 跳）
function httpsGetBuffer(url, headers, timeoutMs, redirect) {
  const hops = redirect || 0;
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return reject(new Error('图片地址不合法：' + url));
    }
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: Object.assign({ 'Accept': 'image/*' }, headers || {}),
      timeout: timeoutMs || 30000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 3) {
        res.resume();
        const next = res.headers.location.indexOf('http') === 0
          ? res.headers.location
          : (u.origin + res.headers.location);
        resolve(httpsGetBuffer(next, headers, timeoutMs, hops + 1));
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => reject(new Error('下载图片失败 HTTP ' + res.statusCode + '：' + Buffer.concat(chunks).toString('utf8').slice(0, 200))));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('下载图片超时')));
    req.on('error', reject);
    req.end();
  });
}
