import { getPageUserInfo, toSetUserInfo, fillUserInfo } from "../../user";
import { text as text_cfg } from "../../config";
import { cloud } from "../../cloudAccess";

// components/photoRank/photoRank.ts
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
    text_cfg: text_cfg,
  },

  /**
   * 组件的方法列表
   */
  methods: {
    async reloadData() {
      this.getRank();
      await getPageUserInfo(this);
      await this.getMyRank();
    },

    async getUInfo() {
      toSetUserInfo()
    },
  
    async getRank() {
      const db = await cloud.databaseAsync();
      var rankRes = await db.collection('photo_rank').orderBy('mdate', 'desc').limit(1).get();
      
      if (rankRes.data.length == 0) {
        // 还没有月榜
        return false;
      }
      const rank_stat = rankRes.data[0].stat;
      console.log(rank_stat);
      var ranks = [];
      for (const key in rank_stat) {
        ranks.push({
          _openid: key,
          count: rank_stat[key].count,
          // userInfo: rank_stat[key].userInfo,
        })
      }
      // 填充userInfo
      await fillUserInfo(ranks, "_openid", "userInfo");
      ranks.sort((a, b) => {
        return parseInt(b.count) - parseInt(a.count)
      });
      console.log(ranks);
      for (var i = 0; i < ranks.length; i++) {
        ranks[i].rank = i+1;
      }
      for (var i = 1; i<ranks.length; i++) {
        if (ranks[i].count == ranks[i-1].count) {
          ranks[i].rank = ranks[i - 1].rank;
        }
      }
  
      await this.setData({
        ranks: ranks
      });
  
      await this.getMyRank();
    },
  
    async getMyRank() {
      if (!this.data.user || !this.data.ranks) {
        return false;
      }
      const ranks = this.data.ranks;
    
      const openid = this.data.user.openid;
      console.log(openid, ranks);
      for (const i in ranks) {
        if (ranks[i]._openid === openid) {
          this.setData({
            'user.photo_rank': ranks[i].rank,
            'user.photo_count': ranks[i].count
          });
          return;
        }
      }
    }
  }
})
