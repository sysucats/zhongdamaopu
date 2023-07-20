import { checkAuth } from "../../../../utils/user";
import { cloud } from "../../../../utils/cloudAccess";
import { levelOrderMap } from "../../../../utils/badge";
import api from "../../../../utils/cloudApi";
import { generateUUID } from "../../../../utils/utils";

Page({

  /**
   * 页面的初始数据
   */
  data: {
    input: {},
    badgeLevels: Object.keys(levelOrderMap),
    tipText: '正在鉴权...',
    tipBtn: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(event) {
    console.log(event);
    await checkAuth(this, 2);
  },

  onChangeText(e) {
    const {field} = e.currentTarget.dataset;
    let value = e.detail.value;

    // 对徽章等级字段进行过滤
    if (field === 'levels') {
      value = value.split("").filter(chr => this.data.badgeLevels.includes(chr)).join("");
    }

    // 数字限制
    if (['badgeCount', 'codeCount', 'validDays'].includes(field)) {
      value = value.replace(/[^\d\-+]/g, '');
    }

    this.setData({
      [`input.${field}`]: value 
    });
    return value;
  },

  clickSubmit() {
    console.log(this.data.input);
    // 有效性检查放到后端来检查
    const res = {ok: true};

    if (res.ok) {
      wx.showModal({
        title: '生成成功',
        content: '请返回兑换码管理，获取具体兑换码',
        showCancel: false,
      })
    } else {
      wx.showModal({
        title: '失败了',
        content: res.msg,
        showCancel: false,
      })
    }
  }
})
