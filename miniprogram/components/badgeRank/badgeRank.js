// components/badgeRank/badgeRank.ts
import {
  cloud
} from "../../utils/cloudAccess";
import {
  loadBadgeDefMap,
  sortBadgeDef
} from "../../utils/badge";
import {
  getCatItemMulti,
  getAvatar
} from "../../utils/cat";
import {
  formatDate
} from "../../utils/utils";
import * as config from "../../config";

Component({
  /**
   * 组件的属性列表
   */
  properties: {

  },

  /**
   * 组件的初始数据
   */
  data: {
    dispOrder: [],
    dispContent: {},
    updateTime: null,
  },

  /**
   * 组件的方法列表
   */
  methods: {
    async reloadData() {
      const db = await cloud.databaseAsync();
      // 获取榜单
      let rankRes = (await db.collection('badge_rank').orderBy('mdate', 'desc').limit(1).get()).data;
      if (!rankRes || !rankRes.length) {
        return;
      }
      let updateTime = formatDate(new Date(rankRes[0].mdate), "yyyy-MM-dd hh:mm");
      rankRes = rankRes[0].rank;
      console.log(rankRes);

      // 获取标签定义，按等级进行排序，作为展示顺序
      const badgeDefMap = await loadBadgeDefMap();
      const sortedBadgeDef = await sortBadgeDef(Object.values(badgeDefMap));
      let dispOrder = ['count', 'score'].concat(sortedBadgeDef.map(x => x._id));
      this.setData({
        dispOrder: dispOrder,
        updateTime: updateTime,
      });
      console.log(dispOrder);

      // 获取猫猫信息
      let catInfoMap = {};
      for (const rankKey in rankRes) {
        for (const catId in rankRes[rankKey]) {
          catInfoMap[catId] = null;
        }
      }
      const catInfo = await getCatItemMulti(Object.keys(catInfoMap), {}, true);
      for (const ci of catInfo) {
        catInfoMap[ci._id] = ci;
        catInfoMap[ci._id].avatar = await getAvatar(ci._id, ci.photo_count_best);
      }

      // 补充每个榜单的内容，并排序
      let dispContent = {};
      for (const rankKey in rankRes) {
        dispContent[rankKey] = {
          info: await this._getRankInfo(rankKey, badgeDefMap),
          items: [],
        };
        for (const catId in rankRes[rankKey]) {
          if (!catInfoMap[catId].avatar || (!catInfoMap[catId].avatar.photo_compressed && !catInfoMap[catId].avatar.avatarItem)) {
            console.log(`没有精选图的猫猫上榜了喵: catID - ${catId}`)
            continue;
          }
          let item = {
            _id: catInfoMap[catId]._id,
            name: catInfoMap[catId].name,
            campus: catInfoMap[catId].campus,
            area: catInfoMap[catId].area,
            avatar: catInfoMap[catId].avatar.photo_compressed || catInfoMap[catId].avatar.avatarItem.photo_id,
            count: rankRes[rankKey][catId],
          };
          dispContent[rankKey].items.push(item);
        }
        dispContent[rankKey].items.sort((a, b) => b.count - a.count);
        // 计算排序
        for (let i = 0; i < dispContent[rankKey].items.length; i++) {
          let element = dispContent[rankKey].items[i];
          if (i == 0 || element.count != dispContent[rankKey].items[i - 1].count) {
            element.order = i + 1;
          } else {
            element.order = dispContent[rankKey].items[i - 1].order;
          }
        }
      }
      console.log(dispContent);
      this.setData({
        dispContent: dispContent
      });
    },

    async _getRankInfo(key, badgeDefMap) {
      if (key === 'count') {
        return {
          img: await cloud.signCosUrl(config.badge_rank_count_img),
          name: "徽章总数榜",
          rankDesc: "拥有徽章个数最多的猫猫",
          level: "A",
        };
      }
      if (key === 'score') {
        return {
          img: await cloud.signCosUrl(config.badge_rank_score_img),
          name: "徽章价值榜",
          rankDesc: "徽章总价值最大的猫猫",
          level: "A",
        };
      }

      return {
        img: badgeDefMap[key].img,
        name: `${badgeDefMap[key].name}榜`,
        desc: badgeDefMap[key].desc,
        level: badgeDefMap[key].level,
        rankDesc: badgeDefMap[key].rankDesc,
      };
    },

    changeShowAll(e) {
      const {
        key,
        on
      } = e.currentTarget.dataset;
      this.setData({
        [`dispContent.${key}.showAll`]: on,
      })
    },

    tapCatCard(e) {
      const catId = e.currentTarget.dataset.catId;
      wx.navigateTo({
        url: '/pages/genealogy/detailCat/detailCat?cat_id=' + catId,
      });
    },
  }
})