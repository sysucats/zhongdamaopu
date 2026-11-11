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

async function applyResult(result, user) {
  if (result.migrated) finishViewMigration();
  const data = {
    metrics: result.metrics || {},
    displaySettings: result.displaySettings || { thicknessMm: .6 },
    defs: await signDefs(result.defs),
    unlocked: result.unlocked || [],
    counts: result.counts || {},
    newlyUnlocked: result.newlyUnlocked || [],
  };
  syncCache = data;
  syncAt = Date.now();
  catalogCache = { metrics: data.metrics, defs: data.defs, displaySettings: data.displaySettings };
  catalogAt = syncAt;
  const badges = buildLadders(data, data.unlocked, data.counts, user?.userInfo?.nickName || '').flatMap(ladder => ladder.tiers);
  queueAchievementUnlocks(badges, data.newlyUnlocked);
  return data;
}

async function requestSync(args = {}) {
  const user = await getUser();
  if (!user?.openid) throw new Error('用户信息读取失败');
  const pending = pendingViewedCats();
  const result = pending || args.catId
    ? await invoke('view', { ...args, ...(pending ? { catIds: pending } : {}) })
    : await invoke('sync');
  return applyResult(result, user);
}

// 读取成就状态；force 时跳过缓存。服务端会顺带补发已达条件的成就
async function syncAchievements({ force = false } = {}) {
  if (!force && syncCache && Date.now() - syncAt < SYNC_TTL) {
    return { ...syncCache, defs: await signDefs(syncCache.defs) };
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
  requestSync({ catId }).catch(error => {
    sentViews.delete(catId);
    console.warn('记录浏览失败', error);
  });
}

async function getCatalog() {
  if (catalogCache && Date.now() - catalogAt < CATALOG_TTL) {
    return { ...catalogCache, defs: await signDefs(catalogCache.defs) };
  }
  const result = await invoke('catalog');
  catalogCache = { metrics: result.metrics || {}, defs: await signDefs(result.defs), displaySettings: result.displaySettings || { thicknessMm: .6 } };
  catalogAt = Date.now();
  return catalogCache;
}

function clearAchievementCache() {
  syncCache = null;
  catalogCache = null;
  syncAt = 0;
  catalogAt = 0;
}

// 同一系列、同一统计项的徽章按门槛排成一组阶梯
function buildLadders({ metrics, defs, displaySettings }, unlocked = [], counts = null, ownerName = '') {
  const unlockTime = {};
  const serialNumbers = {};
  unlocked.forEach(record => { unlockTime[record.key] = record.create_date; serialNumbers[record.key] = record.serialNo || null; });
  const ladders = [];
  defs.forEach(def => {
    const id = `${def.series}|${def.rule.metric}`;
    let ladder = ladders.find(item => item.id === id);
    if (!ladder) {
      const metric = metrics[def.rule.metric] || {};
      ladder = { id, series: def.series, name: metric.name || def.rule.metric, unit: metric.unit || '', defs: [] };
      ladders.push(ladder);
    }
    ladder.defs.push(def);
  });
  return ladders.map(({ defs: list, ...ladder }) => {
    const sorted = list.slice().sort((a, b) => a.rule.count - b.rule.count);
    const tiers = sorted.map((def, index) => ({
      key: def.key,
      name: def.name,
      tierName: def.name,
      desc: def.description,
      threshold: def.rule.count,
      unit: ladder.unit,
      tier: index + 1,
      tierCount: sorted.length,
      ladderId: ladder.id,
      categoryName: ladder.name,
      series: ladder.series,
      materialKey: def.materialKey,
      frontImage: def.frontImage,
      backImage: def.backImage,
      model3dUrl: def.model3dUrl || '',
      thicknessMm: displaySettings?.thicknessMm ?? .6,
      engravingModels: sorted.map(item => item.model3dUrl).filter(Boolean),
      ownerName,
      serialNo: unlockTime[def.key] ? serialNumbers[def.key] || null : null,
      unlocked: Boolean(unlockTime[def.key]),
      unlock_time: unlockTime[def.key] || null,
      currentCount: counts && typeof counts[def.rule.metric] === 'number' ? counts[def.rule.metric] : null,
    }));
    return { ...ladder, tiers };
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

module.exports = {
  syncAchievements,
  refreshAchievements,
  trackViewCat,
  getMyAchievements,
  getMyAchievementCount,
  getUnlockedList,
  getShowcase,
  getUserShowcase,
  highestUnlockedByCategory,
  resolveShowcase,
  setShowcase,
  clearAchievementCache,
}
