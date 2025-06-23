var delete_photo_times = 5;

Page({

  /**
   * 页面的初始数据
   */
  data: {

  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  },
  deleteRawPhoto: function() {
    const that = this;
    wx.cloud.callFunction({
      name: "deleteRawPhoto",
      data: {
        count: 6,
      },
      success: (res) => {
        console.log(res);
        if (!res.result.deleted_photos) {
          console.log("删完了886");
          return;
        }
        that.setData({ res: "Total count: " + res.result.total + '. ' + res.result.deleted_photos.join(', ') });
        setTimeout(() => {
          delete_photo_times--;
          if (delete_photo_times > 0) {
            that.run_debug();
          } else {
            console.log("搞定了");
            delete_photo_times = 20;
          }
        }, 1000)
      }
    })
  },
  async run_imProcess() {
    for (let i = 0; i < 10; i++) {
      try {
        let res = await wx.cloud.callFunction({
          name: "imProcess",
          data: {
            app_name: "笃行猫谱",
          }
        });
        console.log(res);
      } catch {
        continue;
      }
    }
  },
  click_like(e) {
    console.log("like", e);
  }
})