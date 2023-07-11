import {
  cloud
} from "../utils/cloudAccess";

async function loadBadgeDefMap() {
  const db = await cloud.databaseAsync();
  let badgeDefMap = (await db.collection("badge_def").get()).data;
  if (!badgeDefMap) {
    return;
  }

  return badgeDefMap.reduce((badgeDefMap, badgeDef) => {
    badgeDefMap[badgeDef._id] = badgeDef;
    return badgeDefMap
  }, {});
}

async function loadUserBadge(openid, badgeDefMap, options) {
  const db = await cloud.databaseAsync();

  const userBadges = (await db.collection("badge").where({
    _openid: openid,
    catId: null,
  }).get()).data;

  const res = await sortBadges(userBadges, badgeDefMap, options);
  return res;
}

async function loadCatBadge(catId) {
  const db = await cloud.databaseAsync();
  const count = (await db.collection('badge').where({
    catId: catId
  }).count()).total;
  let allBadges = [];
  while (allBadges.length < count) {
    const tmp = (await db.collection('badge').where({
      catId: catId
    }).skip(allBadges.length).get()).data;
    allBadges = allBadges.concat(tmp);
  }
  return allBadges;
}

// 按照等级排序，并统计Badge的个数
async function sortBadges(badges, badgeDefMap, options) {
  if (!badges || !badgeDefMap) {
    return;
  }
  // 等级序
  const levelOrderMap = {
    'A': 0,
    'B': 1,
    'C': 2,
  }
  
  // 顺便统计0个的情况
  let userBadgesMap = {};
  for (const id in badgeDefMap) {
    const badgeDef = badgeDefMap[id];
    userBadgesMap[id] = {
      _id: badgeDef._id,
      img: badgeDef.img,
      name: badgeDef.name,
      desc: badgeDef.desc,
      level: badgeDef.level,
      count: 0,
    }
  }

  // 合并已有
  for (const badge of badges) {
    userBadgesMap[badge.badgeDef].count++;
  }

  let mergedBadges = Object.values(userBadgesMap);
  mergedBadges = mergedBadges.toSorted((a, b) => levelOrderMap[a.level] - levelOrderMap[b.level]);

  if (options && options.keepZero) {
    return mergedBadges;
  }

  const res = mergedBadges.filter((value) => value.count);
  return res;
}

// 按等级排序徽章定义
async function sortBadgeDef(badgeDefs) {
  // 等级序（越大越前）
  const levelOrderMap = {
    'A': 3,
    'B': 2,
    'C': 1,
  }

  badgeDefs.sort((a, b) => levelOrderMap[a.level] > levelOrderMap[b.level]);
  return badgeDefs;
}

export {
  loadBadgeDefMap,
  loadUserBadge,
  loadCatBadge,
  sortBadges,
  sortBadgeDef,
}