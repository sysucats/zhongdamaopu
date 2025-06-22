import {
  getUser
} from "../../../../../utils/user";
import {
  deepcopy,
  sleep,
} from "../../../../../utils/utils";
import {
  loadUserBadge,
  loadBadgeDefMap
} from "../../../../../utils/badge";
import {
  getGlobalSettings
} from "../../../../../utils/page";

import api from "../../../../../utils/cloudApi";
const app = getApp();
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
        // 抽取一次
        this.getBadge({ count: 1, reason: 'watchPictureAD' }).then();
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
        // 抽取两次
        this.getBadge({ count: 2, reason: 'watchVideoAD' }).then();
      })
    }

    this.setData({
      pictureAd,
      videoAd,
    });
  },

  // 检查是否配置了徽章
  async checkBadgeDefEmpty() {
    const m = this.jsData.badgeDefMap;
    if (Object.keys(m).length) {
      return;
    }

    await wx.showModal({
      title: '很抱歉',
      content: '管理员未配置徽章，功能暂不可用~',
      showCancel: false
    });

    wx.navigateBack();
  },

  async reloadUserBadge() {
    if (!this.jsData.badgeDefMap) {
      this.jsData.badgeDefMap = await loadBadgeDefMap();
      await this.checkBadgeDefEmpty();
    }
    const { result: lastesBadges } = await app.mpServerless.db.collection("badge").find({
      _openid: this.data.user.openid,
      reason: "checkIn"
    }, {
      limit: 1,
      sort: { acquireTime: -1 },
    })

    if (!lastesBadges.length) {
      this.setData({
        userBadges: await loadUserBadge(this.data.user.openid, this.jsData.badgeDefMap),
        freeBadgeLoaded: true,
      });
      return;
    }

    const todayZero = new Date(new Date().setHours(0, 0, 0, 0));
    const tomorrowZero = new Date(new Date(new Date().setDate(new Date().getDate() + 1)).setHours(0, 0, 0, 0));
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
    const { result: picAdBadges } = await app.mpServerless.db.collection("badge").find({
      _openid: this.data.user.openid,
      reason: "watchPictureAD"
    }, {
      sort: { acquireTime: -1 },
      limit: 10
    })
    const { result: videoAdBadges } = await app.mpServerless.db.collection("badge").find({
      _openid: this.data.user.openid,
      reason: "watchVideoAD"
    }, {
      sort: { acquireTime: -1 },
      limit: 10
    })
    const todayZero = new Date(new Date().setHours(0, 0, 0, 0));
    let todayPicCount = 0, todayVideoCount = 0;

    for (const b of picAdBadges) {
      if (todayZero < new Date(b.acquireTime)) {
        todayPicCount++;
      }
    }
    for (const b of videoAdBadges) {
      if (todayZero < new Date(b.acquireTime)) {
        todayVideoCount++;
      }
    }
    this.setData({ todayPicCount, todayVideoCount });
  },

  async tapForGetBadge(e) {
    if (!this.data.freeBadgeLoaded) {
      return;
    }

    const {
      reason
    } = e.currentTarget.dataset;

    await this.getBadge({ count: 1, reason });
  },

  // 处理获取徽章的请求与 UI
  async getBadge(options) {
    if (this.jsData.badgeGetting) {
      return;
    }
    this.jsData.badgeGetting = true;

    const res = await api.getBadge({
      count: options.count,  // 如果有code，会按code的个数来抽取
      reason: options.reason,
      badgeCode: options.badgeCode
    });

    if (!res.ok) {
      wx.showModal({
        title: '抽取失败',
        content: '错误信息：' + res.msg,
        showCancel: false,
      });
      this.jsData.badgeGetting = false;
      return;
    }

    if (!this.jsData.badgeDefMap) {
      this.jsData.badgeDefMap = await loadBadgeDefMap();
    }

    const badges = res.badges;

    if (!badges) {
      wx.showToast({
        title: '抽失败了..',
        icon: 'none'
      });
    }

    for (const b of badges) {
      this.jsData.waitingBadge.push(b);
    }
    await this.startGetBadgeAni();
    await this.reloadUserBadge();

    this.jsData.badgeGetting = false;
    return badges;
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
    this.jsData.rotateCounter++;
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
    this.setData({ modal });
  },

  // 用户点击已有徽章
  tapUserModal(e) {
    const { index } = e.currentTarget.dataset;
    const badge = this.data.userBadges[index];
    this.showBadgeModal("徽章详情", "获得的徽章请送给心动猫咪哦~", badge);
  },

  async onModalClose(e) {
    // 关闭弹窗后，可能还有没展示的
    await this.startGetBadgeAni();
  },

  // 开始展示抽取徽章的动画，实际上已经抽取完毕
  async startGetBadgeAni() {
    let waittingCount = this.jsData.waitingBadge.length;
    if (!waittingCount) {
      return;
    }

    const badge = this.jsData.waitingBadge.shift();
    waittingCount--;

    wx.vibrateLong();
    this.runAni();
    await sleep(1000);
    let bottomTips = waittingCount ? `剩余抽取次数${waittingCount}次` : "快去送给心动猫咪吧~";
    this.showBadgeModal('恭喜获得新徽章', bottomTips, this.jsData.badgeDefMap[badge.badgeDef]);
  },

  bindInputCode(e) {
    var { value } = e.detail;
    this.setData({
      inputBadgeCode: value,
    });
    return value;
  },

  async useBadgeCode() {
    const { inputBadgeCode } = this.data;
    if (!inputBadgeCode || this.jsData.usingCode) {
      return;
    }
    this.jsData.usingCode = true;
    console.log("using code: ", inputBadgeCode);
    const badges = await this.getBadge({ badgeCode: inputBadgeCode });

    // 抽到了再清空
    if (badges) {
      this.setData({
        inputBadgeCode: "",
      });
    }
    this.jsData.usingCode = false;
  },

  toHistory() {
    wx.navigateTo({
      url: '/pages/packageA/pages/info/badge/badgeHistory/badgeHistory',
    })
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () { },

  onShareTimeline: function () { },
})