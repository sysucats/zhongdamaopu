import {
  cloud
} from "../../../utils/cloudAccess";
import {
  getUser
} from "../../../utils/user";
import {
  deepcopy,
  sleep,
} from "../../../utils/utils";
import {
  loadUserBadge,
  loadBadgeDefMap
} from "../../../utils/badge";
import {
  getGlobalSettings
} from "../../../utils/page";

import api from "../../../utils/cloudApi";

Page({

  /**
   * 页面的初始数据
   */
  data: {
    rotateAnimation: null,
    shakeAnimation: null,
    nextFreeBadgesHours: 0,
    nextFreeBadgesMins: 0,
    todayPicLimit: 3,
    todayVideoLimit: 6,
  },

  jsData: {
    waitingBadge: [],  // 等待抽取的徽章（弹窗关闭后抽取）
    badgeDefMap: null,
    rotateAnimationObj: wx.createAnimation({
      duration: 800,
      timingFunction: 'ease-in', // "linear","ease","ease-in","ease-in-out","ease-out","step-start","step-end"
      delay: 0,
      transformOrigin: '50% 50% 0'
    }),
    rotateCounter: 0,
    shakeAnimationObj: wx.createAnimation({
      duration: 12,
      timingFunction: 'ease-in', // "linear","ease","ease-in","ease-in-out","ease-out","step-start","step-end"
      delay: 0,
      transformOrigin: '50% 50% 0'
    }),
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    await this.loadUser()
    await this.loadAD()
    await this.reloadUserBadge()
  },

  async loadUser() {
    var user = await getUser({
      nocache: true,
    });
    user = deepcopy(user);
    if (!user.userInfo) {
      user.userInfo = {};
    }
    this.setData({
      user: user
    });
  },

  async loadAD() {
    const ads = await getGlobalSettings('ads') || {};
    let pictureAd = null
    if (wx.createInterstitialAd) {
      pictureAd = wx.createInterstitialAd({
        adUnitId: ads.badge_interstitial
      })
      pictureAd.onLoad(() => {
        this.setData({
          pictureAdLoaded: true,
        });
      })
      pictureAd.onError((err) => {
        this.setData({
          pictureAdLoaded: false,
        });
      })
      pictureAd.onClose(() => {
        this.getBadge('watchPictureAD').then();
      })
    }

    let videoAd = null
    if (wx.createRewardedVideoAd) {
      videoAd = wx.createRewardedVideoAd({
        adUnitId: ads.badge_video
      })
      videoAd.onLoad(() => {
        this.setData({
          videoAdLoaded: true,
        });
      })
      videoAd.onError((err) => {
        this.setData({
          videoAdLoaded: false,
        });
      })
      videoAd.onClose((res) => {
        if (!res.isEnded) {
          return;
        }
        this.jsData.waitingBadge.push({
          reason: 'watchVideoAD'
        });
        this.getBadge('watchVideoAD').then();
      })
    }

    this.setData({
      pictureAd,
      videoAd,
    });
  },

  async reloadUserBadge() {
    if (!this.jsData.badgeDefMap) {
      this.jsData.badgeDefMap = await loadBadgeDefMap();
    }
    
    const db = await cloud.databaseAsync();
    const lastesBadges = (await db.collection("badge").where({
      _openid: this.data.user.openid,
      reason: "checkIn",
    }).orderBy("acquireTime", "desc").limit(1).get()).data;

    if (!lastesBadges.length) {
      this.setData({
        userBadges: await loadUserBadge(this.data.user.openid, this.jsData.badgeDefMap),
        freeBadgeLoaded: true,
      });
      return;
    }

    const todayZero = new Date(new Date().setHours(0, 0, 0, 0));
    const tomorrowZero = new Date(new Date(new Date().setDate(new Date().getDate() + 1)).setHours(0,0,0,0));
    const freeBadgeLoaded = todayZero > new Date(lastesBadges[0].acquireTime);
    let nextFreeBadgesMins = Math.ceil((tomorrowZero.getTime() - (new Date()).getTime()) / 60000);
    let nextFreeBadgesHours = parseInt(nextFreeBadgesMins / 60);
    nextFreeBadgesMins = nextFreeBadgesMins % 60;

    this.setData({
      userBadges: await loadUserBadge(this.data.user.openid, this.jsData.badgeDefMap),
      freeBadgeLoaded: freeBadgeLoaded,
      nextFreeBadgesHours: nextFreeBadgesHours,
      nextFreeBadgesMins: nextFreeBadgesMins,
    });

    await this.checkDailyLimit();
  },

  async checkDailyLimit() {
    // 检查广告次数上限
    const db = await cloud.databaseAsync();
    const picAdBadges = (await db.collection("badge").where({
      _openid: this.data.user.openid,
      reason: "watchPictureAD",
    }).orderBy("acquireTime", "desc").limit(10).get()).data;
    const videoAdBadges = (await db.collection("badge").where({
      _openid: this.data.user.openid,
      reason: "watchVideoAD",
    }).orderBy("acquireTime", "desc").limit(10).get()).data;
    const todayZero = new Date(new Date().setHours(0, 0, 0, 0));
    let todayPicCount = 0, todayVideoCount = 0;

    for (const b of picAdBadges) {
      if (todayZero < new Date(b.acquireTime)) {
        todayPicCount ++;
      }
    }
    for (const b of videoAdBadges) {
      if (todayZero < new Date(b.acquireTime)) {
        todayVideoCount ++;
      }
    }
    this.setData({todayPicCount, todayVideoCount});
  },

  async tapForGetBadge(e) {
    if (!this.data.freeBadgeLoaded) {
      return;
    }

    const {
      reason
    } = e.currentTarget.dataset;

    await this.getBadge(reason);
  },

  // 处理获取徽章的请求与 UI
  async getBadge(reason) {
    if (this.jsData.badgeGetting) {
      return;
    }
    this.jsData.badgeGetting = true;

    const badges = (await api.getBadge({
      count: 1,
      reason
    })).result.badges;
    
    if (!this.jsData.badgeDefMap) {
      this.jsData.badgeDefMap = await loadBadgeDefMap();
    }

    if (badges) {
      wx.vibrateLong();
      this.runAni();
      await sleep(1000);
      this.showBadgeModal('恭喜获得新徽章！', '快去送给心动猫咪吧~', this.jsData.badgeDefMap[badges[0].badgeDef])
    } else {
      wx.showToast({
        title: '抽失败了..',
        icon: 'none'
      });
    }

    await this.reloadUserBadge();
    
    this.jsData.badgeGetting = false;
  },

  async watchADForGetBadge(e) {
    const {
      type
    } = e.currentTarget.dataset;
    if (type == 'picture') {
      if (!this.data.pictureAd || !this.data.pictureAdLoaded || this.data.todayPicCount >= this.data.todayPicLimit) {
        wx.showToast({
          title: '无可用广告',
          icon: 'none'
        });
        return;
      }
      try {
        await this.data.pictureAd.show();
      } catch {
        wx.showToast({
          title: '请稍后重试',
          icon: 'none'
        });
      }
    }
    if (type == 'video') {
      if (!this.data.videoAd || !this.data.videoAdLoaded || this.data.todayVideoCount >= this.data.todayVideoLimit) {
        wx.showToast({
          title: '无可用广告',
          icon: 'none'
        });
        return;
      }
      try {
        await this.data.videoAd.show()
      } catch {
        wx.showToast({
          title: '请稍后重试',
          icon: 'none'
        });
      }
    }
  },
  
  runAni: function () {
    // 旋转动画
    this.jsData.rotateCounter ++;
    this.jsData.rotateAnimationObj.rotate(360 * this.jsData.rotateCounter).step();
    // 震动动画
    for (let i = 0; i < 10; i++) {
      this.jsData.shakeAnimationObj.scale(0.96, 0.96).rotate(-3).step();
      this.jsData.shakeAnimationObj.scale(1.0, 1.0).rotate(+3).step();
      this.jsData.shakeAnimationObj.rotate(0).step();
    }
    this.setData({
      rotateAnimation: this.jsData.rotateAnimationObj.export(),
      shakeAnimation: this.jsData.shakeAnimationObj.export()
    });
  },

  // 展示弹窗
  showBadgeModal(title, tip, badge) {
    const modal = {
      show: true,
      title: title,
      name: badge.name,
      img: badge.img,
      desc: badge.desc,
      level: badge.level,
      tip: tip,
    };
    this.setData({modal});
  },

  // 用户点击已有徽章
  tapUserModal(e) {
    const {index} = e.currentTarget.dataset;
    const badge = this.data.userBadges[index];
    this.showBadgeModal("徽章详情", "获得的徽章请送给心动猫咪哦~", badge);
  },

  onModalClose(e) {
    if (this.jsData.waitingBadge.length) {
      const {reason} = this.jsData.waitingBadge.shift();
      console.log("waiting badge");
      this.getBadge(reason).then();
    }
  },

  
  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {},

  onShareTimeline: function () {},
})