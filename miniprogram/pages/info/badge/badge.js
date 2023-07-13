import {
  cloud
} from "../../../utils/cloudAccess";
import {
  getUser
} from "../../../utils/user";
import {
  deepcopy,
  formatDate
} from "../../../utils/utils";
import {
  loadUserBadge,
  loadBadgeDefMap
} from "../../../utils/badge";

import api from "../../../utils/cloudApi";

Page({

  /**
   * 页面的初始数据
   */
  data: {
    rotateAnimation: null,
    shakeAnimation: null,
  },

  jsData: {
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
    let pictureAd = null
    if (wx.createInterstitialAd) {
      pictureAd = wx.createInterstitialAd({
        adUnitId: 'adunit-287bf3706975a01b'
      })
      pictureAd.onLoad(() => {})
      pictureAd.onError((err) => {})
      pictureAd.onClose((res) => {
        this.getBadge(1, 'watchPictureAD')
      })
    }

    let videoAd = null
    if (wx.createRewardedVideoAd) {
      videoAd = wx.createRewardedVideoAd({
        adUnitId: 'adunit-0bdd3872e84a0a60'
      })
      videoAd.onLoad(() => {})
      videoAd.onError((err) => {})
      videoAd.onClose((res) => {
        this.getBadge(2, 'watchVideoAD')
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
    this.setData({
      userBadges: await loadUserBadge(this.data.user.openid, this.jsData.badgeDefMap),
    })
  },

  async reloadLastCheckInTime() {
    const db = await cloud.databaseAsync();
    let lastestBadgeGottenByCheckIn = (await db.collection("badge").where({
      _openid: this.data.user.openid,
      reason: 'checkIn'
    }).orderBy('acquireTime', 'desc').get()).data[0];
    if (lastestBadgeGottenByCheckIn) {
      lastestBadgeGottenByCheckIn.date = formatDate(lastestToken.acquireTime, 'yyyy-MM-dd');
      this.setData({
        lastestBadgeGottenByCheckIn: lastestBadgeGottenByCheckIn,
      })
    }
  },

  async tapForGetBadge(e) {
    const {
      count,
      reason
    } = e.currentTarget.dataset;

    // this.getBadge(count, reason)
    wx.vibrateLong();
    this.runAni();
  },

  // 处理获取徽章的请求与 UI
  async getBadge(count, reason) {
    await api.getBadge({
      count: Number(count),
      reason
    });
    this.reloadUserBadge()
  },

  async watchADForGetBadge(e) {
    const {
      type
    } = e.currentTarget.dataset;
    switch (type) {
      case 'picture':
        if (this.data.pictureAd) {
          this.data.pictureAd.show()
        }
        break;
      case 'video':
        if (this.data.videoAd) {
          this.data.videoAd.show()
        }
        break
    }
  },
  
  runAni: function () {
    // 旋转动画
    this.jsData.rotateCounter ++;
    this.jsData.rotateAnimationObj.rotate(360 * this.jsData.rotateCounter).step();
    // 震动动画
    for (let i = 0; i < 10; i++) {
      this.jsData.shakeAnimationObj.scale(0.96, 0.96).rotate(-3).step();
      // this.jsData.shakeAnimationObj.step();
      this.jsData.shakeAnimationObj.scale(1.0, 1.0).rotate(+3).step();
      // this.jsData.shakeAnimationObj.step();
      this.jsData.shakeAnimationObj.rotate(0).step();
    }
    this.setData({
      rotateAnimation: this.jsData.rotateAnimationObj.export(),
      shakeAnimation: this.jsData.shakeAnimationObj.export()
    });
  },
})