import { getCurrentPath, shareTo } from "../../../utils/utils";
import { getPageUserInfo, checkCanFeedback } from "../../../utils/user";
import { requestNotice, sendNotifyChkFeeedback } from "../../../utils/msg";
import { text as text_cfg } from "../../../config";
import { cloud } from "../../../utils/cloudAccess";
import api from "../../../utils/cloudApi";

Page({
  /**
   * 页面的初始数据
   */
  data: {
    isAuth: false,
    user: {},
    feedbackLength: 0,
    maxlength: 300,
    cat: undefined,
    text_cfg: text_cfg
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    const db = await cloud.databaseAsync();
    if (options.cat_id != undefined) {
      const catRes = await db.collection('cat').doc(options.cat_id).field({ name: true, _id: true }).get();
      this.setData({
        cat: catRes.data
      });
    }

    // 检查是否可以上传
    this.setData({
      canFeedback: await checkCanFeedback()
    });
  },

  async onShow() {
    await getPageUserInfo(this);
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    const pagesStack = getCurrentPages();
    const path = getCurrentPath(pagesStack);
    
    const share_text = `来给${this.data.cat.name}反馈信息 - ${text_cfg.app_name}`;
    return shareTo(share_text, path);
  },

  getUInfo: function() {
    this.setData({
    showEdit: true
    });
  },
  closeEdit: function() {
    this.setData({
    showEdit: false
    });
  },

  bindInput(e) {
    var inputData = e.detail.value;
    var name = e.currentTarget.dataset.name;
    if (name == 'feedbackInfo') {
      this.setData({
        feedbackLength: inputData.length
      })
      return;
    }

    if (name == 'contactInfo') {
      this.setData({
        contactLength: inputData.length
      })
      return;
    }
  },

  async safeCheck(submitData) {
    
  },

  async bindSubmit(e) {
    var submitData = e.detail.value;
    if (!submitData.feedbackInfo) {
      wx.showToast({
        title: '请填写信息后再提交哦',
        icon: 'none'
      })
      return;
    }
    
    // 安全检查
    console.log(submitData);
    const checkRes = await api.contentSafeCheck(submitData.feedbackInfo + submitData.contactInfo, "");
    console.log(checkRes);
    if (checkRes) {
      // 检测出问题
      wx.showModal(checkRes);
      return false;
    }

    wx.showLoading({
      title: '正在提交...',
      mask: true,
    })
    var data = {
      openid: this.data.user.openid,
      openDate: api.getDate(),
      feedbackInfo: submitData.feedbackInfo,
      contactInfo: submitData.contactInfo,
      dealed: false,
    };
    if (this.data.cat != undefined) {
      data.cat_id = this.data.cat._id;
      data.cat_name = this.data.cat_name;
    }
    const res = (await api.curdOp({
      operation: "add",
      collection: "feedback",
      data: data
    })).result;

    console.log("curdOp(add-feedback) result:", res);
    if (!res.ok) {
      console.log('repliable record fail:\n');
      return;
    }
    this.setData({
      feedbackId : res.id
    });
    await this.askNotice();
    wx.hideLoading();
    await sendNotifyChkFeeedback();
    wx.showToast({
      title: '收到你的反馈啦',
      icon: 'success',
      duration: 1000
    })
  },
  
  async askNotice() {
    let repliable = await requestNotice('feedback'); // 请求订阅消息推送

    const res = (await api.curdOp({
      operation: "update",
      collection: "feedback",
      item_id: this.data.feedbackId,
      data: { repliable: repliable },
    })).result;

    console.log("curdOp(feedback-update) result:", res);
    if (res.ok) {
      wx.navigateBack();
    } else {
      console.log('repliable record fail:\n',res);
    }
     
  },

  async changeAgreement(e) {
    console.log(e);
    const checked = e.detail.value.length > 0;
    this.setData({
      agreementChecked: checked,
    })
  }
})

