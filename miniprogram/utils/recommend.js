// 猫友圈的「推荐关注」
// 纯前端实现：数据全部来自 cat / comment 集合现成字段，不依赖云函数。
// 打分维度：新照片(mphoto) / 新猫(create_time) / 人气(popularity+照片数) / 便利贴(comment 计数) / 亲和(同校区、关系猫)
import { getAvatar } from "./cat";

const app = getApp();

const DAY = 24 * 60 * 60 * 1000;
// 超过一年没有新过审照片的猫视为「长期没人打理的旧档案」，不再进入推荐
const DORMANT_DAYS = 365;
// 池子结构变过（整池补便利贴数）时换个 key，避免旧缓存里未计数的猫被复用
const POOL_KEY = "cat-recommend-pool-v3";
const POOL_TTL = 10 * 60 * 1000;
// 便利贴分批查，单批 cat 数，避免一次 $in 的结果被 limit 截断
const NOTE_BATCH = 20;
const SHOWN_KEY = "cat-recommend-shown";
const SHOWN_TTL = 24 * 60 * 60 * 1000;

// 只取打分需要的字段，减少一次查询的返回体积
const PROJECTION = {
  name: 1,
  campus: 1,
  area: 1,
  popularity: 1,
  photo_count_total: 1,
  mphoto: 1,
  create_time: 1,
  to_star: 1,
};

// 冷启动（还没关注任何猫）：没有任何亲和信息，权重全给公开信号
const WEIGHTS_COLD = { newCat: 0.35, fresh: 0.30, pop: 0.25, notes: 0.10, affinity: 0 };
// 已有关注：同校区 / 关系猫开始起作用
const WEIGHTS_WARM = { newCat: 0.20, fresh: 0.28, pop: 0.16, notes: 0.14, affinity: 0.22 };

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// 距今天数，字段缺失返回 null
function daysSince(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / DAY;
}

function normalizeIds(ids) {
  if (!ids) return [];
  return Array.isArray(ids) ? ids : [ids];
}

// 是否属于「超一年没有新照片」的休眠档案
// - 已去喵星的猫不适用：它们不再会有新照片，但用户仍然惦记，按原方案留 1 个置底位
// - 没有 mphoto 时退回 create_time：老档案且从无过审照片 → 同样算休眠；
//   一年内新建的猫以「新来的猫」身份保留（这正是冷启动的主要信号）
function isDormant(cat) {
  if (!cat || cat.to_star) return false;
  const dPhoto = daysSince(cat.mphoto);
  if (dPhoto !== null) return dPhoto > DORMANT_DAYS;
  const dCreate = daysSince(cat.create_time);
  if (dCreate !== null) return dCreate > DORMANT_DAYS;
  return true;
}

// 四个入口各查一次，合并去重；同一只猫可能同时命中多个入口
// 人气榜单独加「一年内有新照片」的限制，否则前 24 名可能全是没人打理的旧档案；
// 喵星猫不参与该限制，单独取一小批，保证置底那 1 个位置一直有猫
async function fetchPool() {
  const db = app.mpServerless.db.collection("cat");
  const base = { deleted: { $ne: 1 } };
  const newSince = new Date(Date.now() - 60 * DAY);
  const freshSince = new Date(Date.now() - 21 * DAY);
  const activeSince = new Date(Date.now() - DORMANT_DAYS * DAY);

  const [created, photographed, popular, star] = await Promise.all([
    db.find({ ...base, create_time: { $gte: newSince } }, {
      sort: { create_time: -1 }, projection: PROJECTION, limit: 24,
    }),
    db.find({ ...base, mphoto: { $gte: freshSince } }, {
      sort: { mphoto: -1 }, projection: PROJECTION, limit: 24,
    }),
    db.find({ ...base, mphoto: { $gte: activeSince } }, {
      sort: { popularity: -1 }, projection: PROJECTION, limit: 24,
    }),
    // to_star 历史上存过 0/1，也可能有布尔值，两种都收
    db.find({ ...base, to_star: { $in: [1, true] } }, {
      sort: { popularity: -1 }, projection: PROJECTION, limit: 8,
    }),
  ]);

  const map = new Map();
  [created, photographed, popular, star].forEach(res => {
    const list = (res && res.result) || [];
    list.forEach(cat => {
      if (!cat || !cat._id || !cat.name) return;
      map.set(cat._id, cat);
    });
  });
  return Array.from(map.values());
}

// 便利贴计数：整池分批并发查询，单批 limit 1000 避免截断
// 口径与 followFeed 一致：排除已删除、待审核、带照片的评论
async function fillNotes(cats) {
  if (!cats.length) return cats;
  const tally = new Map();
  try {
    const batches = Array.from(
      { length: Math.ceil(cats.length / NOTE_BATCH) },
      (_, i) => cats.slice(i * NOTE_BATCH, (i + 1) * NOTE_BATCH).map(c => c._id)
    );
    const results = await Promise.all(batches.map(ids =>
      app.mpServerless.db.collection("comment").find(
        { cat_id: { $in: ids }, deleted: { $ne: true }, needVerify: { $ne: true } },
        { projection: { cat_id: 1, photo_id: 1 }, limit: 1000 }
      )
    ));
    results.forEach(res => {
      // EMAS 客户端查询不认 $exists，带图评论在客户端排除（同 utils/comment.js）
      ((res && res.result) || []).forEach(c => {
        if (!c || c.photo_id) return;
        tally.set(c.cat_id, (tally.get(c.cat_id) || 0) + 1);
      });
    });
  } catch (err) {
    console.warn("[recommend] 便利贴计数失败:", err);
  }
  cats.forEach(c => { c.notes = tally.get(c._id) || 0; });
  return cats;
}

function scoreOf(cat, ctx) {
  const w = ctx.weights;
  const dFresh = daysSince(cat.mphoto);
  const dNew = daysSince(cat.create_time);

  // 新照片：3 天内满分，21 天线性归零
  const fresh = dFresh === null ? 0 : clamp01(1 - Math.max(0, dFresh - 3) / 18);
  // 新来的猫：45 天归零
  const newCat = dNew === null ? 0 : clamp01(1 - dNew / 45);
  // 人气：人气值 + 照片数×10，与猫谱一致，800 封顶做归一化
  const pop = clamp01(((cat.popularity || 0) + (cat.photo_count_total || 0) * 10) / 800);
  // 便利贴：15 张封顶
  const notes = clamp01((cat.notes || 0) / 15);
  // 亲和：同校区 > 已关注猫的关系猫 > 基础值
  const affinity = ctx.campus && cat.campus === ctx.campus
    ? 1
    : ctx.relationIds.has(cat._id) ? 0.9 : 0.3;

  const parts = { fresh, newCat, pop, notes, affinity };
  let score = 0;
  Object.keys(parts).forEach(key => { score += (w[key] || 0) * parts[key]; });
  // 轻微随机：同样好的一批猫每次刷新顺序略有不同
  score *= 1 + (Math.random() * 0.12 - 0.06);

  return { score, parts, dFresh, dNew };
}

const REASON_ORDER = ["fresh", "newCat", "notes", "pop", "affinity"];

// 取加权贡献最大的维度作为推荐理由，让用户知道「为什么推荐它」
function reasonOf(cat, scored, ctx) {
  if (cat.to_star) {
    return { text: "已去喵星 · 记得它", tone: "gray" };
  }
  let best = null;
  REASON_ORDER.forEach(key => {
    const weighted = (ctx.weights[key] || 0) * (scored.parts[key] || 0);
    if (!best || weighted > best.weighted + 1e-6) best = { key, weighted };
  });
  if (!best || best.weighted <= 0.01) {
    return { text: cat.campus ? `同在${cat.campus}` : "推荐给你", tone: "gray" };
  }
  switch (best.key) {
    case "fresh": {
      const d = Math.max(0, Math.round(scored.dFresh || 0));
      return { text: d <= 0 ? "今天有新照片" : `${d} 天前有新照片`, tone: "green" };
    }
    case "newCat": {
      const d = Math.max(0, Math.round(scored.dNew || 0));
      return { text: d <= 7 ? "新来的猫" : `刚建档 ${d} 天`, tone: "green" };
    }
    case "notes":
      return { text: `${cat.notes || 0} 张便利贴`, tone: "pink" };
    case "pop":
      return { text: `人气 ${Math.round((cat.popularity || 0) + (cat.photo_count_total || 0) * 10)}`, tone: "amber" };
    default:
      return { text: cat.campus ? `同在${cat.campus}` : "同校猫猫", tone: "gray" };
  }
}

// 多样性：同一校区先按 2 只上限选；凑不满再放宽到 3 只，仍不够才完全不限。
// 分档放宽是为了「既不被单一校区刷屏，也不至于一屏只有两三张卡」。
function pickWithDiversity(items, limit) {
  const picked = [];
  const campusCount = {};
  const capPasses = [2, 3, Infinity];

  for (const cap of capPasses) {
    if (picked.length >= limit) break;
    for (const item of items) {
      if (picked.length >= limit) break;
      if (picked.indexOf(item) >= 0) continue;
      const key = item.cat.campus || "未知校区";
      if ((campusCount[key] || 0) >= cap) continue;
      campusCount[key] = (campusCount[key] || 0) + 1;
      picked.push(item);
    }
  }
  return picked;
}

function readShown() {
  const raw = wx.getStorageSync(SHOWN_KEY);
  if (!raw || !raw.t || Date.now() - raw.t > SHOWN_TTL) return new Set();
  return new Set(raw.ids || []);
}

function rememberShown(ids) {
  const shown = readShown();
  ids.forEach(id => shown.add(id));
  try {
    wx.setStorageSync(SHOWN_KEY, { t: Date.now(), ids: Array.from(shown) });
  } catch (err) {
    console.warn("[recommend] 记录曝光失败:", err);
  }
}

function clearShown() {
  wx.removeStorageSync(SHOWN_KEY);
}

// 候选池缓存 10 分钟：进去一次查 4 次 cat + 若干批 comment，
// 「换一批」只是换选法，不再打库
async function loadPool(force) {
  if (!force) {
    const cached = wx.getStorageSync(POOL_KEY);
    if (cached && cached.t && Date.now() - cached.t < POOL_TTL && Array.isArray(cached.list)) {
      return cached.list;
    }
  }

  const pool = await fetchPool();
  // 整池都补便利贴数，缓存复用时「换一批」也不会出现该维度恒为 0 的猫
  await fillNotes(pool);

  try {
    wx.setStorageSync(POOL_KEY, { t: Date.now(), list: pool });
  } catch (err) {
    console.warn("[recommend] 缓存候选池失败:", err);
  }
  return pool;
}

/**
 * 取推荐关注的猫
 * @param {Object} options
 * @param {string[]} options.followedIds 已关注的猫，会被排除
 * @param {string} options.campus 用户主要活动校区（取自已关注猫）
 * @param {string[]} options.relationIds 已关注猫的关系猫 id
 * @param {number} options.limit 返回条数，默认 6
 * @param {boolean} options.rotate 「换一批」，排除近 24 小时展示过的
 * @param {boolean} options.force 忽略缓存重新拉取
 * @returns {Promise<Array>} [{_id,name,campus,area,to_star,avatar,reasonText,reasonTone}]
 */
async function getRecommendedCats(options = {}) {
  const limit = options.limit || 6;
  const followedIds = new Set(normalizeIds(options.followedIds));
  const relationIds = new Set(normalizeIds(options.relationIds));
  const ctx = {
    campus: options.campus || "",
    relationIds,
    weights: followedIds.size === 0 ? WEIGHTS_COLD : WEIGHTS_WARM,
  };

  const pool = await loadPool(!!options.force);

  let scored = pool
    // 兜底再过滤一次：旧缓存或边界数据里可能还留着超一年没新照片的猫
    .filter(cat => !followedIds.has(cat._id) && !isDormant(cat))
    .map(cat => ({ cat, ...scoreOf(cat, ctx) }))
    .sort((a, b) => b.score - a.score);

  if (options.rotate) {
    const shown = readShown();
    if (shown.size) {
      const left = scored.filter(item => !shown.has(item.cat._id));
      // 剩下的不够凑一屏就重置曝光记录，避免「换一批」变空白
      if (left.length >= limit) {
        scored = left;
      } else {
        clearShown();
      }
    }
  }

  const normal = scored.filter(item => !item.cat.to_star);
  const star = scored.filter(item => item.cat.to_star);
  // 已去喵星的猫给 1 个位置、永远排在最后
  const starSlot = star.length ? 1 : 0;
  const picked = pickWithDiversity(normal, Math.max(0, limit - starSlot))
    .concat(star.slice(0, starSlot));

  if (!picked.length) return [];

  const avatars = await getAvatar(picked.map(item => item.cat._id));
  const list = picked.map((item, index) => {
    const cat = item.cat;
    const reason = reasonOf(cat, item, ctx);
    return {
      _id: cat._id,
      name: cat.name || "未知猫猫",
      campus: cat.campus || "",
      area: cat.area || "",
      to_star: !!cat.to_star,
      avatar: avatars[index] || null,
      reasonText: reason.text,
      reasonTone: reason.tone,
      followed: false,
    };
  });

  rememberShown(list.map(cat => cat._id));
  return list;
}

// 从已关注的猫里取主要校区（同校区出现次数最多的那个）
function getMajorCampus(followCatsList) {
  const count = {};
  (followCatsList || []).forEach(cat => {
    if (!cat || !cat.campus) return;
    count[cat.campus] = (count[cat.campus] || 0) + 1;
  });
  let major = "";
  let max = 0;
  Object.keys(count).forEach(campus => {
    if (count[campus] > max) {
      max = count[campus];
      major = campus;
    }
  });
  return major;
}

// 已关注猫的关系猫 id（relations: [{cat_id, type, alias}]）
function getRelationIds(followCatsList) {
  const ids = [];
  (followCatsList || []).forEach(cat => {
    if (!cat || !Array.isArray(cat.relations)) return;
    cat.relations.forEach(rel => {
      if (rel && rel.cat_id) ids.push(rel.cat_id);
    });
  });
  return Array.from(new Set(ids));
}

export {
  getRecommendedCats,
  getMajorCampus,
  getRelationIds,
};
