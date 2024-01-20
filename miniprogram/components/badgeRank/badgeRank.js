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
    loading: false,
    avatarMap: {},
    filters: [{
      name: "季度榜",
      days: 90,
    }, {
      name: "半年榜",
      days: 180,
    }, {
      name: "全年榜",
      days: 365
    }],
    activeFilter: 0,  // 激活的下标
  },

  /**
   * 组件的方法列表
   */
  methods: {
    async reloadData() {
      this.setData({
        loading: true
      })
      const db = await cloud.databaseAsync();
      // 获取榜单和标签定义
      let [rankRes, badgeDefMap] = await Promise.all([
        db.collection('badge_rank').orderBy('mdate', 'desc').limit(1).get(),
        loadBadgeDefMap(),
      ]);
      rankRes = rankRes.data;
      if (!rankRes || !rankRes.length) {
        return;
      }
      let updateTime = formatDate(new Date(rankRes[0].mdate), "yyyy-MM-dd hh:mm");
      // 找到激活的filter
      const {filters, activeFilter} = this.data;
      let activeRankKey = filters[activeFilter].days;
      rankRes = rankRes[0].rankV2[activeRankKey];
      // console.log(rankRes);

      // 获取标签定义，按等级进行排序，作为展示顺
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
      const catInfo = await getCatItemMulti(Object.keys(catInfoMap));
      for (const ci of catInfo) {
        catInfoMap[ci._id] = ci;
      }

      // 补充每个榜单的内容，并排序
      let dispContent = {};
      for (const rankKey in rankRes) {
        dispContent[rankKey] = {
          info: await this._getRankInfo(rankKey, badgeDefMap),
          items: [],
        };
        for (const catId in rankRes[rankKey]) {
          let item = {
            _id: catInfoMap[catId]._id,
            name: catInfoMap[catId].name,
            campus: catInfoMap[catId].campus,
            habit: catInfoMap[catId].habit,
            area: catInfoMap[catId].area,
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
      // console.log(dispContent);
      this.setData({
        hasContent: true,
        dispContent: dispContent,
        loading: false
      });

      // 再加载头像
      await this.loadAvatarMap(catInfo);
    },

    async _getOneAvatar(id, photo_count_best) {
      const avatar = await getAvatar(id, photo_count_best);
      if (!avatar || (!avatar.photo_compressed && !avatar.photo_id)) {
        return;
      }
      this.setData({
        [`avatarMap.${id}`]: avatar.photo_compressed || avatar.photo_id,
      });
    },

    async loadAvatarMap(catInfo) {
      let all_querys = [];
      for (const ci of catInfo) {
        all_querys.push(this._getOneAvatar(ci._id, ci.photo_count_best));
      }
      await Promise.all(all_querys);
      return;
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
    
    
  // 点击时间筛选
  fClickTime(e) {
    var {index} = e.currentTarget.dataset;
    if (this.data.loading || index === this.data.activeFilter) {
      return;
    }

    this.setData({
      activeFilter: index,
    });

    this.reloadData();
  },
  }
})