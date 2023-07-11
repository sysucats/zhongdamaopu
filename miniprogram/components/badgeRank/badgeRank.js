// components/badgeRank/badgeRank.ts
import { cloud } from "../../cloudAccess";
import { loadBadgeDefMap, sortBadgeDef } from  "../../utils/badge";
import { getCatItemMulti, getAvatar } from "../../cat";

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
  },

  /**
   * 组件的方法列表
   */
  methods: {
    async reloadData() {
      const db = await cloud.databaseAsync();
      // 获取榜单
      let rankRes = (await db.collection('badge_rank').orderBy('mdate', 'desc').limit(1).get()).data;
      if (!rankRes) {
        return;
      }
      rankRes = rankRes[0].rank;
      console.log(rankRes);

      // 获取标签定义，按等级进行排序，作为展示顺序
      const badgeDefMap = await loadBadgeDefMap();
      const sortedBadgeDef = await sortBadgeDef(Object.values(badgeDefMap));
      let dispOrder = ['count', 'score'].concat(sortedBadgeDef.map(x => x._id));
      this.setData({
        dispOrder: dispOrder
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
        catInfoMap[ci._id].avatar = await getAvatar(ci._id, ci.photo_count_best);
      }

      // 补充每个榜单的内容，并排序
      let dispContent = {};
      for (const rankKey in rankRes) {
        dispContent[rankKey] = {
          info: this._getRankInfo(rankKey, badgeDefMap),
          items: [],
        };
        for (const catId in rankRes[rankKey]) {
          let item = {
            _id: catInfoMap[catId]._id,
            name: catInfoMap[catId].name,
            campus: catInfoMap[catId].campus,
            avatar: catInfoMap[catId].avatar.photo_compressed || catInfoMap[catId].avatar.avatarItem.photo_id,
            count: rankRes[rankKey][catId],
          };
          dispContent[rankKey].items.push(item);
        }
        dispContent[rankKey].items.sort((a, b) => a.count > b.count);
      }
      console.log(dispContent);
      this.setData({
        dispContent: dispContent
      });
    },

    _getRankInfo(key, badgeDefMap) {
      if (key === 'count') {
        return {
          img: "",  // TODO: 加个通用徽章图
          name: "徽章总数榜",
          desc: "拥有徽章个数最多的猫猫",
        };
      }
      if (key === 'score') {
        return {
          img: "",  // TODO: 加个通用徽章图
          name: "徽章价值榜",
          desc: "徽章总价值最大的猫猫",
        };
      }

      return {
        img: badgeDefMap[key].img,
        name: `${badgeDefMap[key].name}榜`,
        desc: badgeDefMap[key].desc,
      };
    }
  }
})
