// pages/tools/updateUserRole/updateUserRole.js
Page({

  /**
   * 页面的初始数据
   */
  data: {

  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {

  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  async updateUserRole() {
    const db = wx.cloud.database();
    const _ = db.command;
    const $ = db.command.aggregate
    var count = 0;
    while (1) {
      const users = (await await db.collection('photo').aggregate()
      .group({
        // 按 category 字段分组
        _id: '$_openid',
        count: $.sum(1),
      })
      .skip(count)
      .end()).list;
      console.log(count, users)
      if (!users.length) {
        break;
      }

      count += users.length;
      for (const u of users) {
        console.log(u._id);
        await wx.cloud.callFunction({
          name: "userOp",
          data: {
            "op": "updateRole",
            "user": {
              openid: u._id,
              role: 1
            },
          }
        })
      }
    }
  }

})