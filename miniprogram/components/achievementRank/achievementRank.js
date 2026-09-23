// components/achievementRank/achievementRank.js
// 成就数量排行榜
import api from "../../utils/cloudApi";
import { getUser } from "../../utils/user";

Component({
  data: {
    list: [],
    loading: false,
    myOpenid: '',
    myCount: 0,
    myRank: 0,
  },

  methods: {
    async reloadData() {
      if (this.data.loading) {
        return;
      }
      this.setData({ loading: true });
      try {
        const res = await api.getAchievementRank();
        const list = (res && res.success && res.data) || [];

        // 我的排名
        let myOpenid = '';
        let myCount = 0;
        let myRank = 0;
        try {
          const user = await getUser();
          myOpenid = user.openid || '';
        } catch (e) { /* 忽略 */ }
        const mine = list.find(x => x.openid === myOpenid);
        if (mine) {
          myCount = mine.count;
          myRank = mine.rank;
        }

        this.setData({
          list,
          myOpenid,
          myCount,
          myRank,
          loading: false,
        });
      } catch (e) {
        console.error('加载成就榜失败', e);
        this.setData({ loading: false });
      }
    },

    toMyAchievement() {
      wx.navigateTo({
        url: '/pages/info/myAchievement/myAchievement',
      });
    },
  }
})
