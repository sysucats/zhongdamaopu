// components/achievementRank/achievementRank.js
// 成就数量排行榜
import api from "../../utils/cloudApi";
import { getUser } from "../../utils/user";
import { getMyAchievementCount } from "../../utils/achievement";
import { signCosUrl } from "../../utils/common";

const app = getApp();
const defaultAvatarUrl = '/pages/public/images/info/default_avatar.png';

Component({
  data: {
    list: [],
    loading: false,
    profileLoaded: false,
    hasProfile: false,
    showEdit: false,
    myOpenid: '',
    myCount: 0,
    myRank: 0,
    myName: '',
    myAvatarUrl: defaultAvatarUrl,
  },

  lifetimes: {
    attached() {
      this.boundReloadData = this.reloadData.bind(this);
      app.globalData.eventBus.$on('userInfoUpdated', this.boundReloadData);
    },
    detached() {
      app.globalData.eventBus.$off('userInfoUpdated', this.boundReloadData);
    },
  },

  methods: {
    editProfile() { this.setData({ showEdit: true }); },
    closeEdit() { this.setData({ showEdit: false }); },

    async reloadData() {
      if (this.data.loading) {
        return;
      }
      this.setData({ loading: true });
      try {
        const [user, unlockedCount] = await Promise.all([
          getUser().catch(() => null),
          getMyAchievementCount().catch(() => 0),
        ]);
        const res = await api.getAchievementRank();
        const list = (res && res.success && res.data) || [];

        const myOpenid = user?.openid || '';
        await Promise.all(list.map(async item => {
          item.avatarUrl = item.openid === myOpenid
            ? user?.userInfo?.avatarUrl || defaultAvatarUrl
            : (await signCosUrl(item.avatarUrl)) || defaultAvatarUrl;
        }));
        const mine = list.find(x => x.openid === myOpenid);
        const myCount = mine ? mine.count : unlockedCount;

        this.setData({
          list,
          myOpenid,
          profileLoaded: true,
          hasProfile: Boolean(user?.userInfo?.nickName?.trim() && user?.userInfo?.avatarUrl),
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

    openShowcase(e) {
      const { openid, name } = e.currentTarget.dataset;
      if (!openid) return;
      this.triggerEvent('showcase', { openid, name: name || '猫友' });
    },
  }
})
