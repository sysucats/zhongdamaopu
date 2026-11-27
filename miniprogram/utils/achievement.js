// 用户成就：徽章定义和获得记录都由服务端维护，前端只负责展示
// 发放由 unionOp 的 achievement action 完成（op: catalog / sync / view）
// 用户主页展示位存在 user 集合的 showcase_achievements 字段（最多 3 个 key）
import { getUser } from "./user";
import api from "./cloudApi";
import { signCosUrl } from './common';
import { queueAchievementUnlocks } from './achievementUnlock';
const app = getApp();

const SYNC_TTL = 60 * 1000;
const CATALOG_TTL = 30 * 60 * 1000;
const VIEW_MIGRATED_KEY = 'achv_view_migrated';
const LEGACY_VIEWED_KEY = 'achv_viewed_cats';
const MAX_MIGRATE_CATS = 500;

let syncCache = null;
let syncAt = 0;
let syncRequest = null;
let catalogCache = null;
let catalogAt = 0;
let cacheVersion = 0;
let nextRequestId = 0;
let appliedRequestId = 0;
const sentViews = new Set();

async function invoke(op, args = {}) {
  const response = await app.mpServerless.function.invoke('unionOp', { unionAction: 'achievement', op, ...args });
  const result = response?.result;
  if (!result?.ok) throw new Error(result?.error || '成就读取失败');
  return result;
}

async function signDefs(defs) {
  return Promise.all((defs || []).map(async def => ({
    ...def,
    frontImage: await signCosUrl(def.frontImage),
    backImage: await signCosUrl(def.backImage),
    model3dUrl: def.model3dUrl ? await signCosUrl(def.model3dUrl) : '',
  })));
}

// 本地旧浏览记录：更新后第一次同步时上传一次，之后由服务端记录
function pendingViewedCats() {
  try {
    if (wx.getStorageSync(VIEW_MIGRATED_KEY)) return null;
    const stored = wx.getStorageSync(LEGACY_VIEWED_KEY);
    const keys = wx.getStorageInfoSync().keys || [];
    const visited = keys.filter(key => key.startsWith('visit-cat-')).map(key => key.slice('visit-cat-'.length));
    return [...new Set([...(Array.isArray(stored) ? stored : []), ...visited].filter(Boolean))].slice(0, MAX_MIGRATE_CATS);
  } catch (error) {
    return null;
  }
}

function finishViewMigration() {
  try {
    wx.setStorageSync(VIEW_MIGRATED_KEY, true);
    wx.removeStorageSync(LEGACY_VIEWED_KEY);
  } catch (error) {
    console.warn('清理本地浏览记录失败', error);
  }
}

async function applyResult(result, user, version, requestId) {
  const data = {
    metrics: result.metrics || {},
    displaySettings: result.displaySettings || { thicknessMm: .6 },
    defs: await signDefs(result.defs),
    unlocked: result.unlocked || [],
    counts: result.counts || {},
    progress: result.progress || {},
    newlyUnlocked: result.newlyUnlocked || [],
  };
  if (version !== cacheVersion) return syncAchievements();
  if (result.migrated) finishViewMigration();
  const badges = buildLadders(data, data.unlocked, data.counts, user?.userInfo?.nickName || '').flatMap(ladder => ladder.tiers);
  // 旧响应的新解锁仍入队，进度沿用较新的结果。
  queueAchievementUnlocks(badges, data.newlyUnlocked);
  if (requestId < appliedRequestId) return syncCache;
  appliedRequestId = requestId;
  syncCache = data;
  syncAt = Date.now();
  catalogCache = { metrics: data.metrics, defs: data.defs, displaySettings: data.displaySettings };
  catalogAt = syncAt;
  return data;
}

async function requestSync(args = {}) {
  const user = await getUser();
  if (!user?.openid) throw new Error('用户信息读取失败');
  const version = cacheVersion, requestId = ++nextRequestId;
  const pending = pendingViewedCats();
  const result = pending || args.catId
    ? await invoke('view', { ...args, ...(pending ? { catIds: pending } : {}) })
    : await invoke('sync');
  return applyResult(result, user, version, requestId);
}

// 读取成就状态；force 时跳过缓存。服务端会顺带补发已达条件的成就
async function syncAchievements({ force = false } = {}) {
  if (!force && syncCache && Date.now() - syncAt < SYNC_TTL) {
    const version = cacheVersion, cached = syncCache;
    const defs = await signDefs(cached.defs);
    if (version !== cacheVersion) return syncAchievements();
    return { ...cached, defs };
  }
  if (!force && syncRequest) return syncRequest;
  const request = requestSync().finally(() => {
    if (syncRequest === request) syncRequest = null;
  });
  syncRequest = request;
  return request;
}

// 关注、点赞成功后调用：让服务端立即判定，新解锁时弹提示
function refreshAchievements() {
  syncAchievements({ force: true }).catch(error => console.warn('成就同步失败', error));
}

// 打开猫详情页时调用：服务端记录浏览，同一只猫本次启动只发一次
function trackViewCat(catId) {
  if (!catId || sentViews.has(catId)) return;
  sentViews.add(catId);
  const version = cacheVersion;
  requestSync({ catId }).catch(error => {
    if (version === cacheVersion) sentViews.delete(catId);
    console.warn('记录浏览失败', error);
  });
}

async function getCatalog() {
  if (catalogCache && Date.now() - catalogAt < CATALOG_TTL) {
    return { ...catalogCache, defs: await signDefs(catalogCache.defs) };
  }
  const version = cacheVersion;
  const result = await invoke('catalog');
  const data = { metrics: result.metrics || {}, defs: await signDefs(result.defs), displaySettings: result.displaySettings || { thicknessMm: .6 } };
  if (version === cacheVersion) {
    catalogCache = data;
    catalogAt = Date.now();
  }
  return data;
}

function clearAchievementCache() {
  cacheVersion++;
  syncRequest = null;
  appliedRequestId = 0;
  sentViews.clear();
  syncCache = null;
  catalogCache = null;
  syncAt = 0;
  catalogAt = 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// 时间窗口结束后仍可能补发（审核延迟）的天数，与云函数一致
const GRACE_DAYS = 30;
const AGG_UNITS = { days: '天', cats: '只' };

// 北京时间的今天 YYYY-MM-DD；时间窗口按北京时间的日期计算
function beijingToday(now = Date.now()) {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// 时间窗口状态：upcoming 未开始 / open 进行中 / ended 刚结束（仍可能补发）/ missed 已错过
function windowState(window, today = beijingToday()) {
  if (!window) return '';
  if (today < window.start) return 'upcoming';
  if (today <= window.end) return 'open';
  return daysBetween(window.end, today) <= GRACE_DAYS ? 'ended' : 'missed';
}

const shortDate = date => date.slice(5);

function windowText(window) {
  if (!window) return '';
  return window.start === window.end ? shortDate(window.start) : `${shortDate(window.start)}–${shortDate(window.end)}`;
}

function windowStateText(window, state, today = beijingToday()) {
  if (state === 'upcoming') return `${shortDate(window.start)} 开始`;
  if (state === 'open') {
    const left = daysBetween(today, window.end);
    return left === 0 ? '今天截止' : `剩 ${left + 1} 天`;
  }
  if (state === 'ended') return '已结束';
  if (state === 'missed') return '已错过';
  return '';
}

const isPlainRule = rule => !rule.window && !rule.agg && !rule.filter;

// 成就分组：系列里有带时间窗口的徽章 → 整个系列平铺（grid），按排序号排列；
// 否则同一系列、同一统计条件的徽章按门槛排成一组阶梯（ladder）
function buildLadders({ metrics, defs, displaySettings, progress }, unlocked = [], counts = null, ownerName = '') {
  const unlockTime = {};
  const serialNumbers = {};
  unlocked.forEach(record => { unlockTime[record.key] = record.create_date; serialNumbers[record.key] = record.serialNo || null; });
  const gridSeries = new Set(defs.filter(def => def.rule?.window).map(def => def.series));
  const today = beijingToday();
  const groups = [];
  defs.forEach(def => {
    const rule = def.rule;
    const layout = gridSeries.has(def.series) ? 'grid' : 'ladder';
    const id = layout === 'grid'
      ? `${def.series}|grid`
      : [def.series, rule.metric, rule.agg || '', rule.filter?.catId || ''].join('|');
    let group = groups.find(item => item.id === id);
    if (!group) {
      const metric = metrics[rule.metric] || {};
      group = layout === 'grid'
        ? { id, layout, series: def.series, name: def.series, unit: '', defs: [] }
        : { id, layout, series: def.series, name: metric.name || rule.metric, unit: AGG_UNITS[rule.agg] || metric.unit || '', defs: [] };
      groups.push(group);
    }
    group.defs.push(def);
  });
  return groups.map(({ defs: list, ...group }) => {
    const grid = group.layout === 'grid';
    const sorted = list.slice().sort(grid
      ? (a, b) => (a.sort || 0) - (b.sort || 0) || a.key.localeCompare(b.key)
      : (a, b) => a.rule.count - b.rule.count);
    const tiers = sorted.map((def, index) => {
      const metric = metrics[def.rule.metric] || {};
      const state = windowState(def.rule.window, today);
      // 带条件的规则用服务端单独算的进度；普通规则用累计总数
      const current = !counts ? null
        : typeof progress?.[def.key] === 'number' ? progress[def.key]
        : isPlainRule(def.rule) && typeof counts[def.rule.metric] === 'number' ? counts[def.rule.metric]
        : null;
      return {
        key: def.key,
        name: def.name,
        tierName: def.name,
        desc: def.description,
        threshold: def.rule.count,
        unit: AGG_UNITS[def.rule.agg] || metric.unit || '',
        tier: grid ? 1 : index + 1,
        tierCount: grid ? 1 : sorted.length,
        // 平铺的徽章各自独立，展示位按单枚计
        ladderId: grid ? def.key : group.id,
        categoryName: group.name,
        series: group.series,
        layout: group.layout,
        window: def.rule.window || null,
        windowText: windowText(def.rule.window),
        windowState: state,
        windowStateText: state ? windowStateText(def.rule.window, state, today) : '',
        materialKey: def.materialKey,
        materialColor: def.materialColor || '',
        frontImage: def.frontImage,
        backImage: def.backImage,
        model3dUrl: def.model3dUrl || '',
        thicknessMm: displaySettings?.thicknessMm ?? .6,
        engravingModels: (grid ? [def] : sorted).map(item => item.model3dUrl).filter(Boolean),
        ownerName,
        serialNo: unlockTime[def.key] ? serialNumbers[def.key] || null : null,
        unlocked: Boolean(unlockTime[def.key]),
        unlock_time: unlockTime[def.key] || null,
        currentCount: current,
      };
    });
    return { ...group, tiers };
  });
}

// 成就页：强制同步一次，返回阶梯列表和本次新解锁的徽章名
async function getMyAchievements() {
  const [data, user] = await Promise.all([syncAchievements({ force: true }), getUser()]);
  return {
    ladders: buildLadders(data, data.unlocked, data.counts, user?.userInfo?.nickName || ''),
    newlyUnlocked: data.newlyUnlocked.map(key => data.defs.find(def => def.key === key)?.name).filter(Boolean),
  };
}

// 已获得的成就数（含已下线徽章的记录），与排行榜口径一致
async function getMyAchievementCount() {
  return (await syncAchievements()).unlocked.length;
}

// 新点亮：解锁不满 7 天且本机还没点开看过详情
const NEW_BADGE_MS = 7 * 24 * 60 * 60 * 1000;
const SEEN_NEW_KEY = 'achv_seen_new';

function readSeenNew() {
  try {
    return new Set(wx.getStorageSync(SEEN_NEW_KEY) || []);
  } catch (error) {
    return new Set();
  }
}

function isNewBadge(badge, seen = readSeenNew()) {
  if (!badge?.unlocked || !badge.unlock_time || seen.has(badge.key)) return false;
  return Date.now() - new Date(badge.unlock_time).getTime() < NEW_BADGE_MS;
}

function markBadgeSeen(key) {
  const seen = readSeenNew();
  if (!key || seen.has(key)) return;
  seen.add(key);
  try {
    wx.setStorageSync(SEEN_NEW_KEY, [...seen]);
  } catch (error) {
    console.warn('记录已看徽章失败', error);
  }
}

async function getNewBadgeCount() {
  const seen = readSeenNew();
  return (await getUnlockedList()).filter(badge => isNewBadge(badge, seen)).length;
}

async function getUnlockedList() {
  const [data, user] = await Promise.all([syncAchievements(), getUser()]);
  return buildLadders(data, data.unlocked, data.counts, user?.userInfo?.nickName || '').flatMap(ladder => ladder.tiers).filter(item => item.unlocked);
}

function highestUnlockedByCategory(list) {
  const result = [];
  list.forEach(achievement => {
    const index = result.findIndex(item => item.ladderId === achievement.ladderId);
    if (index < 0) result.push(achievement);
    else if (achievement.tier > result[index].tier) result[index] = achievement;
  });
  return result;
}

function resolveShowcase(unlocked, saved) {
  const available = highestUnlockedByCategory(unlocked);
  if (saved === null) return available.slice(-3).reverse();
  return highestUnlockedByCategory(saved
    .map(item => available.find(candidate => candidate.ladderId === item.ladderId))
    .filter(Boolean)).slice(0, 3);
}

function savedShowcase(user, badges) {
  if (!Array.isArray(user?.showcase_achievements)) return null;
  return user.showcase_achievements.map(key => badges.find(item => item.key === key)).filter(Boolean);
}

// 当前用户保存的展示位（null 表示从未设置）
async function getShowcase(openid) {
  try {
    const [{ result: user }, data] = await Promise.all([
      app.mpServerless.db.collection('user').findOne({ openid }),
      syncAchievements(),
    ]);
    return savedShowcase(user, buildLadders(data, data.unlocked, null, user?.userInfo?.nickName || '').flatMap(ladder => ladder.tiers));
  } catch (e) {
    console.log('读取展示位失败', e);
    return null;
  }
}

// 其他用户的展示位（排行榜用）
async function getUserShowcase(openid) {
  const [{ result: user }, catalog] = await Promise.all([
    app.mpServerless.db.collection('user').findOne({ openid }),
    getCatalog(),
  ]);
  const records = [];
  const pageSize = 100;
  for (let skip = 0; ; skip += pageSize) {
    const { result: batch } = await app.mpServerless.db.collection('achievement').find(
      { openid }, { sort: { _id: 1 }, skip, limit: pageSize }
    );
    records.push(...batch);
    if (batch.length < pageSize) break;
  }
  const badges = buildLadders(catalog, records, null, user?.userInfo?.nickName || '').flatMap(ladder => ladder.tiers);
  return resolveShowcase(badges.filter(item => item.unlocked), savedShowcase(user, badges));
}

// 保存主页展示位
async function setShowcase(keys) {
  const user = await getUser();
  if (!user || !user._id) {
    return false;
  }
  keys = (keys || []).slice(0, 3);
  try {
    await api.curdOp({
      operation: "update",
      collection: "user",
      item_id: user._id,
      data: { showcase_achievements: keys }
    });
    return true;
  } catch (e) {
    console.log('保存展示位失败', e);
    return false;
  }
}

// 成就档位胶囊（我的成就卡片右侧、后台材质预览共用）：材质色往白色提亮 30% 作起点、到材质色本身，135° 渐变；
// 文字按底色深浅选白字或深字
function materialPillStyle(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return '';
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const light = rgb.map(c => Math.round(c + (255 - c) * 0.3));
  const toHex = list => '#' + list.map(c => c.toString(16).padStart(2, '0')).join('');
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const mid = rgb.map((c, i) => (c + light[i]) / 2);
  const luminance = 0.2126 * lin(mid[0]) + 0.7152 * lin(mid[1]) + 0.0722 * lin(mid[2]);
  const text = 1.05 / (luminance + 0.05) >= 3 ? 'var(--color-text-inverse)' : 'var(--color-black-light)';
  return `color: ${text}; background: linear-gradient(135deg, ${toHex(light)} 0%, ${hex} 100%);`;
}

// 规则说明，与云函数 achievementRules.describeRule 保持一致
function describeRule(rule, metrics = {}) {
  const metric = metrics[rule?.metric];
  if (!metric) return '';
  const count = rule.count || '…';
  let text;
  // 只有 1 只时「不同的」多余
  const distinct = Number(rule.count) === 1 ? '' : '不同的';
  if (rule.agg === 'days') text = `${metric.label}累计 ${count} 天`;
  else if (rule.agg === 'cats') text = `为 ${count} 只${distinct}猫猫${metric.label}`;
  else text = (metric.desc || '').replace('{}', count).replace('不同的', distinct);
  if (rule.filter?.catId) text = metric.catDesc || `${text}（限指定猫猫）`;
  if (rule.window) {
    const { start, end } = rule.window;
    text = start === end ? `${start.slice(5)} 当天${text}` : `${start.slice(5)} 至 ${end.slice(5)} ${text}`;
  }
  return text;
}

module.exports = {
  describeRule,
  materialPillStyle,
  syncAchievements,
  refreshAchievements,
  trackViewCat,
  getMyAchievements,
  getMyAchievementCount,
  getUnlockedList,
  isNewBadge,
  markBadgeSeen,
  getNewBadgeCount,
  getShowcase,
  getUserShowcase,
  highestUnlockedByCategory,
  resolveShowcase,
  setShowcase,
  clearAchievementCache,
}
