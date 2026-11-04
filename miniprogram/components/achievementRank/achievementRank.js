// components/achievementRank/achievementRank.js
// 成就数量排行榜
import api from "../../utils/cloudApi";
import { getUser } from "../../utils/user";
import { getMyAchievements } from "../../utils/achievement";
import { signCosUrl } from "../../utils/common";

const defaultAvatarUrl = '/pages/public/images/info/default_avatar.png';

Component({
  data: {
    list: [],
    loading: false,
    myOpenid: '',
    myCount: 0,
    myRank: 0,
    myName: '',
    myAvatarUrl: defaultAvatarUrl,
  },

  methods: {
    async reloadData() {
      if (this.data.loading) {
        return;
      }
      this.setData({ loading: true });
      try {
        const [res, user, achievements] = await Promise.all([
          api.getAchievementRank(),
          getUser().catch(() => null),
          getMyAchievements().catch(() => []),
        ]);
        const list = (res && res.success && res.data) || [];

        const myOpenid = user?.openid || '';
        await Promise.all(list.map(async item => {
          item.avatarUrl = item.openid === myOpenid
            ? user?.userInfo?.avatarUrl || defaultAvatarUrl
            : (await signCosUrl(item.avatarUrl)) || defaultAvatarUrl;
        }));
        const mine = list.find(x => x.openid === myOpenid);
        const myCount = mine ? mine.count : achievements.reduce(
          (sum, category) => sum + category.tiers.filter(tier => tier.unlocked).length, 0
        );

        this.setData({
          list,
          myOpenid,
          myCount,
          myRank: mine ? mine.rank : 0,
          myName: user?.userInfo?.nickName || '猫友',
          myAvatarUrl: user?.userInfo?.avatarUrl || defaultAvatarUrl,
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
