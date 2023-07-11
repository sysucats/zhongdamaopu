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

async function loadUserBadge(openid, badgeDefMap) {
  const db = await cloud.databaseAsync();

  const userBadges = (await db.collection("badge").where({
    _openid: openid,
    catId: null,
  }).get()).data;

  return await sortBadges(userBadges, badgeDefMap);
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
async function sortBadges(badges, badgeDefMap) {
  if (!badges || !badgeDefMap) {
    return;
  }
  // 等级序（越大越前）
  const levelOrderMap = {
    'A': 3,
    'B': 2,
    'C': 1,
  }
  // 先合并
  let mergedBadges = badges.reduce((userBadgesMap, badge) => {
    const badgeDef = badgeDefMap[badge.badgeDef];

    if (!userBadgesMap[badge.badgeDef]) {
      userBadgesMap[badge.badgeDef] = {
        _id: badgeDef._id,
        img: badgeDef.img,
        name: badgeDef.name,
        desc: badgeDef.desc,
        level: badgeDef.level,
        levelOrder: levelOrderMap[badgeDef.level],
        count: 0,
      }
    }
    userBadgesMap[badge.badgeDef].count++;

    return userBadgesMap;
  }, {});

  mergedBadges = Object.values(mergedBadges);

  mergedBadges.sort((a, b) => a.levelOrder > b.levelOrder);

  return mergedBadges;
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