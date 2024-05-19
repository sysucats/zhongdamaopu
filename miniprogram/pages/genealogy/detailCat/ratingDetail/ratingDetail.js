import { convertRatingList, genDefaultRating } from "../../../../utils/rating";
import api from "../../../../utils/cloudApi";
import { cloud } from "../../../../utils/cloudAccess";


Page({

  /**
   * 页面的初始数据
   */
  data: {
    catRatings: genDefaultRating(),
    myRatingId: undefined,
    myRatings: genDefaultRating(),
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    this.setData({
      cat_id: options.cat_id,
      user: wx.getStorageSync('current-user')
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
    const db = await cloud.databaseAsync();
    // 获取榜单和标签定义
    if (!this.data.user.openid) {
      return
    }
    let [myRatingsItems] = await Promise.all([
      db.collection('rating').where({_openid: this.data.user.openid, cat_id: this.data.cat_id}).limit(1).get(),
    ]);

    console.log(myRatingsItems);

    if (!myRatingsItems.data || !myRatingsItems.data.length) {
      // 还没有评分
      return ;
    }

    let data = myRatingsItems.data[0];

    let myRatings = convertRatingList(data);
    
    console.log(myRatings);
    this.setData({
      myRatings,
      myRatingId: data._id,
    })
  },

  // 重新加载猫猫信息
  async reloadCatRating() {
    let {cat_id} = this.data;
    const db = await cloud.databaseAsync();
    let cat = (await db.collection('cat').doc(cat_id).get()).data;

    console.log(cat);

    if (!cat.rating) {
      this.setData({
        cat
      });
      return;
    }

    let {scores} = cat.rating;
    let catRatings = convertRatingList(scores);

    this.setData({
      cat,
      catRatings
    });
  },

  changRating(e) {
    let {i, j} = e.currentTarget.dataset;
    // console.log(i, j);
    this.setData({
      [`myRatings[${i}].score`]: j+1,
    });
  },

  async submitRating(e) {
    let { myRatingId, myRatings, cat_id } = this.data;
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
      var res = (await api.curdOp({
        operation: "add",
        collection: "rating",
        data: item
      })).result;
    } else {
      var res = (await api.curdOp({
        operation: "update",
        collection: "rating",
        data: item,
        item_id: myRatingId
      })).result;
    }
    
    console.log(res);

    // 更新猫的评分
    await api.updateCatRating({cat_id});
    await this.reloadCatRating();

    wx.showToast({
      title: '提交成功',
      icon: 'success'
    });

  }
})