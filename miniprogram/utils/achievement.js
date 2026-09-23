// 用户自动成就系统（铜/银/金三级版）
// 数据库集合：achievement  { openid, key, create_date }
// key 格式：{类目id}_{数量门槛}，如 photo_10
// 用户主页展示位存在 user 集合的 showcase_achievements 字段（最多3个key）
import { getUser } from "./user";
import api from "./cloudApi";
const app = getApp();

// 级别定义
const TIERS = [
  { tier: 1, name: '铜牌', short: '铜', color: '#c88a4b' },
  { tier: 2, name: '银牌', short: '银', color: '#9aa5b1' },
  { tier: 3, name: '金牌', short: '金', color: '#e6a823' },
];

// 成就类目（顺序即展示顺序），tiers 为铜/银/金的数量门槛
const CATEGORIES = [
  { id: 'view',    name: '猫口普查', icon: '🔍', unit: '只', tiers: [1, 10, 30], desc: '看过 {} 只不同的猫猫' },
  { id: 'follow',  name: '吸猫',     icon: '❤️', unit: '只', tiers: [1, 5, 15],  desc: '关注 {} 只猫猫' },
  { id: 'photo',   name: '留影',     icon: '📷', unit: '张', tiers: [1, 10, 30], desc: '上传 {} 张照片' },
  { id: 'comment', name: '便利贴',   icon: '📝', unit: '张', tiers: [1, 10, 30], desc: '发出 {} 张便利贴' },
  { id: 'like',    name: '点赞',     icon: '👍', unit: '个', tiers: [1, 10, 50], desc: '给出 {} 个点赞' },
];

// 旧版 key → 新版 key 的兼容映射（v1.1.0 初版成就的 key）
const LEGACY_KEY_MAP = {
  first_view: 'view_1', view_10: 'view_10',
  follow_1: 'follow_1', follow_5: 'follow_5',
  first_photo: 'photo_1', photo_10: 'photo_10',
  first_comment: 'comment_1', comment_10: 'comment_10',
  first_like: 'like_1', like_10: 'like_10',
};

// 由 key 反查定义：key = `${id}_${threshold}`
function _defOfKey(key) {
  if (typeof key !== 'string') return null;
  const idx = key.lastIndexOf('_');
  if (idx <= 0) return null;
  const catId = key.slice(0, idx);
  const threshold = parseInt(key.slice(idx + 1));
  const cat = CATEGORIES.find(c => c.id === catId);
  if (!cat || isNaN(threshold)) return null;
  const tierIdx = cat.tiers.indexOf(threshold);
  if (tierIdx < 0) return null;
  return {
    key,
    catId,
    threshold,
    tier: tierIdx + 1,
    tierName: TIERS[tierIdx].name,
    tierShort: TIERS[tierIdx].short,
    tierColor: TIERS[tierIdx].color,
    name: `${cat.name}·${TIERS[tierIdx].name}`,
    desc: cat.desc.replace('{}', threshold),
    icon: cat.icon,
  };
}

// 已解锁缓存（key 集合，含旧 key 映射后的结果）
var _unlockedCache = null;

async function _getUnlocked() {
  if (_unlockedCache) {
    return _unlockedCache;
  }
  _unlockedCache = new Set();
  try {
    const user = await getUser();
    if (!user || !user.openid) {
      return _unlockedCache;
    }
    const { result } = await app.mpServerless.db.collection('achievement').find({ openid: user.openid });
    (result || []).forEach(r => {
      const mapped = LEGACY_KEY_MAP[r.key] || r.key;
      _unlockedCache.add(mapped);
    });
  } catch (e) {
    console.log('读取成就失败', e);
  }
  return _unlockedCache;
}

// 解锁某个具体成就（幂等）
async function unlock(key) {
  const def = _defOfKey(key);
  if (!def) {
    return false;
  }
  const unlocked = await _getUnlocked();
  if (unlocked.has(key)) {
    return false;
  }
  try {
    const user = await getUser();
    if (!user || !user.openid) {
      return false;
    }
    // 先标记，防止并发重复解锁
    unlocked.add(key);
    const res = await api.curdOp({
      operation: "add",
      collection: "achievement",
      data: {
        openid: user.openid,
        key: key,
      }
    });
    // curdOp 失败时不抛异常、只返回错误对象，必须检查 insertedId 才算真的写入成功
    if (!res || !res.insertedId) {
      unlocked.delete(key);
      console.warn('[成就] 写入云端失败（检查：1. EMAS是否已建achievement集合 2. unionOp云函数是否已更新部署）', res);
      wx.showToast({
        title: '成就同步失败，请联系管理员',
        icon: 'none',
      });
      return false;
    }
    wx.showToast({
      title: `解锁成就「${def.name}」`,
      icon: 'none',
      duration: 2000,
    });
    return true;
  } catch (e) {
    console.log('解锁成就失败', e);
    return false;
  }
}

// 数量型成就：根据当前数量解锁所有已达门槛的级别
async function _trackCount(catId, count) {
  const cat = CATEGORIES.find(c => c.id === catId);
  if (!cat || typeof count !== 'number') {
    return;
  }
  for (const threshold of cat.tiers) {
    if (count >= threshold) {
      await unlock(`${catId}_${threshold}`);
    }
  }
}

// 查看猫猫详情触发（本地记录看过的猫）
async function trackViewCat(cat_id) {
  if (!cat_id) {
    return;
  }
  try {
    var viewed = wx.getStorageSync('achv_viewed_cats') || [];
    if (!Array.isArray(viewed)) {
      viewed = [];
    }
    if (viewed.includes(cat_id)) {
      return;
    }
    viewed.push(cat_id);
    wx.setStorageSync('achv_viewed_cats', viewed);
    await _trackCount('view', viewed.length);
  } catch (e) {
    console.log('trackViewCat fail', e);
  }
}

// 上传照片成功后触发
async function trackAddPhoto() {
  try {
    const user = await getUser();
    if (!user || !user.openid) {
      return;
    }
    const { result: count } = await app.mpServerless.db.collection('photo').count({ _openid: user.openid });
    await _trackCount('photo', count);
  } catch (e) {
    console.log('trackAddPhoto fail', e);
  }
}

// 发便利贴成功后触发
async function trackComment() {
  try {
    const user = await getUser();
    if (!user || !user.openid) {
      return;
    }
    const { result: count } = await app.mpServerless.db.collection('comment').count({ user_openid: user.openid });
    await _trackCount('comment', count);
  } catch (e) {
    console.log('trackComment fail', e);
  }
}

// 点赞成功后触发
async function trackLike() {
  try {
    const user = await getUser();
    if (!user || !user.openid) {
      return;
    }
    const { result: count } = await app.mpServerless.db.collection('inter').count({ type: 10000, uid: user.openid });
    await _trackCount('like', count);
  } catch (e) {
    console.log('trackLike fail', e);
  }
}

// 关注猫猫后触发（传入当前关注总数）
async function trackFollow(followCount) {
  try {
    await _trackCount('follow', followCount);
  } catch (e) {
    console.log('trackFollow fail', e);
  }
}

// 获取全部成就及解锁状态（成就页用）
// 返回：[{ id, name, icon, unit, desc, tiers: [{tier, tierName, tierColor, threshold, key, unlocked, unlock_time}] }]
async function getMyAchievements() {
  const unlocked = await _getUnlocked();
  // 补充解锁时间
  var timeMap = {};
  try {
    const user = await getUser();
    if (user && user.openid) {
      const { result } = await app.mpServerless.db.collection('achievement').find({ openid: user.openid });
      (result || []).forEach(r => {
        const mapped = LEGACY_KEY_MAP[r.key] || r.key;
        if (!timeMap[mapped]) {
          timeMap[mapped] = r.create_date;
        }
      });
    }
  } catch (e) {
    console.log('读取成就时间失败', e);
  }
  return CATEGORIES.map(cat => ({
    id: cat.id,
    name: cat.name,
    icon: cat.icon,
    unit: cat.unit,
    tiers: cat.tiers.map((threshold, i) => {
      const key = `${cat.id}_${threshold}`;
      return {
        key: key,
        tier: i + 1,
        tierName: TIERS[i].name,
        tierShort: TIERS[i].short,
        tierColor: TIERS[i].color,
        threshold: threshold,
        desc: cat.desc.replace('{}', threshold),
        unlocked: unlocked.has(key),
        unlock_time: timeMap[key] || null,
      };
    }),
  }));
}

// 获取已解锁成就的扁平列表（主页展示位选择器用）
async function getUnlockedList() {
  const cats = await getMyAchievements();
  const list = [];
  cats.forEach(cat => {
    cat.tiers.forEach(t => {
      if (t.unlocked) {
        list.push({
          key: t.key,
          name: `${cat.name}·${t.tierName}`,
          tier: t.tier,
          tierColor: t.tierColor,
          icon: cat.icon,
          desc: t.desc,
          unlock_time: t.unlock_time,
        });
      }
    });
  });
  return list;
}

// 读取用户的主页展示位（key 数组，最多3个）
async function getShowcase(openid) {
  try {
    const { result: user } = await app.mpServerless.db.collection('user').findOne({ openid: openid });
    if (!user || !user.showcase_achievements) return null;
    return user.showcase_achievements.map(k => _defOfKey(k)).filter(Boolean);
  } catch (e) {
    console.log('读取展示位失败', e);
    return null;
  }
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
  TIERS,
  CATEGORIES,
  unlock,
  trackViewCat,
  trackAddPhoto,
  trackComment,
  trackLike,
  trackFollow,
  getMyAchievements,
  getUnlockedList,
  getShowcase,
  setShowcase,
}
