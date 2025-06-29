import { convertRatingList, genDefaultRating } from "../../../../utils/rating";
import api from "../../../../utils/cloudApi";

const app = getApp();
Page({

  /**
   * 页面的初始数据
   */
  data: {
    catRatings: genDefaultRating(),
    myRatingId: undefined,
    myRatings: genDefaultRating(),
  },

  jsData: {
    submitting: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    this.setData({
      cat_id: options.cat_id,
      user: wx.getStorageSync('current-user').item
    });
    await Promise.all([
      this.reloadMyRatings(),
      this.reloadCatRating()
    ]);
  },
  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  async onShow() {
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  },

  // 重新加载自己的评分
  async reloadMyRatings() {
    // 获取榜单和标签定义
    if (!this.data.user.openid) {
      console.log(this.data);
      return
    }
    const { result: myRatingsItems } = await app.mpServerless.db.collection('rating').findOne({ _openid: this.data.user.openid, cat_id: this.data.cat_id })

    console.log(myRatingsItems);

    if (!myRatingsItems) {
      // 还没有评分
      return;
    }

    let myRatings = convertRatingList(myRatingsItems);

    console.log(myRatings);
    this.setData({
      myRatings,
      myRatingId: myRatingsItems._id,
    })
  },

  // 重新加载猫猫信息
  async reloadCatRating() {
    let { cat_id } = this.data;
    let { result: cat } = await app.mpServerless.db.collection('cat').findOne({ _id: cat_id })

    console.log(cat);

    if (!cat.rating) {
      this.setData({
        cat
      });
      return;
    }

    let { scores } = cat.rating;
    let catRatings = convertRatingList(scores);

    this.setData({
      cat,
      catRatings
    });
  },

  changRating(e) {
    let { i, j } = e.currentTarget.dataset;
    // console.log(i, j);
    this.setData({
      [`myRatings[${i}].score`]: j + 1,
    });
  },

  async submitRating(e) {
    let { submitting } = this.jsData;
    if (submitting) {
      return;
    }
    this.jsData.submitting = true;
    wx.showLoading({
      title: '提交中...',
    });

    let { myRatingId, myRatings, cat_id, user } = this.data;

    if (!user.userInfo.nickName) {
      // 防止机器人刷评分
      wx.showToast({
        title: '请先设置用户昵称',
        icon: 'none'
      })
      return;
    }
    let item = {
      cat_id
    };
    for (const r of myRatings) {
      if (!r.score) {
        wx.showToast({
          title: '评分不能为0',
          icon: 'none'
        })
        return false;
      }
      item[r.key] = r.score;
    }

    if (!myRatingId) {
      var res = await api.curdOp({
        operation: "add",
        collection: "rating",
        data: item
      });
    } else {
      var res = await api.curdOp({
        operation: "update",
        collection: "rating",
        data: item,
        item_id: myRatingId
      });
    }

    console.log(res);

    // 更新猫的评分
    await api.updateCatRating({ cat_id });
    await Promise.all([
      this.reloadMyRatings(),
      this.reloadCatRating()
    ]);

    wx.hideLoading();

    wx.showToast({
      title: '提交成功',
      icon: 'success'
    });
    this.jsData.submitting = false;
  }
})