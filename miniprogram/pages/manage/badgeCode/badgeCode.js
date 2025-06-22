// pages/manage/badgeCode/badgeCode.ts
import { checkAuth } from "../../../utils/user";
import { formatDate } from "../../../utils/utils";
import api from "../../../utils/cloudApi";


Page({

  /**
   * 页面的初始数据
   */
  data: {
    
  },

  jsData: {
    codes: [],
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    await checkAuth(this, 3)
  },

  async onShow() {
    this.jsData.codes = [];
    await this.loadMoreCode();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  async onReachBottom() {
    await this.loadMoreCode();
  },

  async loadMoreCode() {
    if (this.jsData.reloading) {
      return false;
    }
    this.jsData.reloading = true;
    let codes = this.jsData.codes;
    const newCodes = await api.loadBadgeCode({
      skip: codes.length,
      limit: 30
    });

    this.jsData.codes = codes.concat(newCodes);
    console.log(this.jsData.codes);

    this._buildGroups();

    this.jsData.reloading = false;
  },

  _buildGroups() {
    // 按照生成Task来分组
    let groups = {};
    const {codes} = this.jsData;
    for (let i=0; i<codes.length; i++) {
      let c = codes[i];
      if (groups[c.genTaskId] === undefined) {
        // info就读第一个item吧
        groups[c.genTaskId] = [];
      }
      c.rawIndex = i;
      c.genTimeStr = formatDate(c.genTime, "yyyy年MM月dd日 hh:mm:ss")
      c.validTimeStr = formatDate(c.validTime, "yyyy年MM月dd日 hh:mm:ss")
      groups[c.genTaskId].push(c);
    }
    this.setData({groups});
  },

  // 新增
  onNew() {
    wx.navigateTo({
      url: "/pages/manage/badgeCode/addBadgeCode/addBadgeCode",
    });
  },

  // 复制到剪贴板
  async copyCodes(e) {
    const { taskid, range } = e.currentTarget.dataset;
    const { groups } = this.data;
    const { genCount } = groups[taskid][0];
    // 保证这一组都加载到了
    while (this.data.groups[taskid].length < genCount) {
      await this.loadMoreCode();
    }

    let codes = this.data.groups[taskid];
    
    if (range === "useful") {
      codes = codes.filter(val => val.isValid && val.useTime === null);
    }

    const copyStr = codes.map(val => val.code).join("\n");
    console.log(copyStr);

    await wx.setClipboardData({ data: copyStr });

    wx.showToast({
      title: '已复制',
    });
  },

  async copyOneCode(e) {
    const { code } = e.currentTarget.dataset;
    await wx.setClipboardData({ data: code });
    wx.showToast({
      title: '已复制',
    });
  },

  async changeValid(e) {
    const { taskid, index } = e.currentTarget.dataset;
    const { _id, isValid, rawIndex } = this.data.groups[taskid][index];

    await api.curdOp({
      operation: "update",
      collection: "badge_code",
      item_id: _id,
      data: { isValid: !isValid },
    });

    this.jsData.codes[rawIndex].isValid = !isValid;
    this._buildGroups();
  }
})