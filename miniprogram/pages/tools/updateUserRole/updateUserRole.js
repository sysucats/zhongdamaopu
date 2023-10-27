// pages/tools/updateUserRole/updateUserRole.js
import { cloud } from "../../../utils/cloudAccess";
import api from "../../../utils/cloudApi";

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
    const db = await cloud.databaseAsync();
    const _ = db.command;
    const $ = db.command.aggregate
    var totalCount = await db.collection('photo').aggregate()
      .group({
        // 按 category 字段分组
        _id: '$_openid',
        count: $.sum(1),
      })
      .count('totalCount')
      .end();
    totalCount = totalCount.list[0].totalCount;
    console.log(totalCount);
    this.setData({
      totalCount
    })
    var count = 0;
    while (1) {
      const users = (await db.collection('photo').aggregate()
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
      var reqs = [];
      for (const u of users) {
        console.log(u._id);
        reqs.push(api.userOp({
          "op": "updateRole",
          "user": {
            openid: u._id,
            role: 1
          },
        }));
      }
      await Promise.all(reqs);
      this.setData({
        doneCount: count
      })
    }
  }

})