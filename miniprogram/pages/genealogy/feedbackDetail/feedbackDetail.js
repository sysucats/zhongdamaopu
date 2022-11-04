import { getCurrentPath, shareTo } from "../../../utils";
import { getPageUserInfo, checkCanUpload, toSetUserInfo } from "../../../user";
import { requestNotice, sendNotifyChkFeeedback } from "../../../msg";
import { text as text_cfg } from "../../../config";
import { cloud } from "../../../cloudAccess";

Page({

  /**
   * 页面的初始数据
   */
  data: {
    isAuth: false,
    user: {},
    length: 0,
    maxlength: 300,
    cat: undefined,
    text_cfg: text_cfg
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    const db = cloud.database();
    if (options.cat_id != undefined) {
      const catRes = await db.collection('cat').doc(options.cat_id).field({ name: true, _id: true }).get();
      this.setData({
        cat: catRes.data
      });
    }

    // 检查是否可以上传
    this.setData({
      canUpload: await checkCanUpload()
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

  getUInfo() {
    toSetUserInfo()
  },

  bindInput(e) {
    var inputData = e.detail.value;
    this.setData({
      length: inputData.length
    })
  },

  async bindSubmit(e) {
    var submitData = e.detail.value;
    if (!submitData.feedbackInfo) {
      wx.showToast({
        title: '请填写信息后再提交哦',
        icon: 'none'
      })
      return;
    } /* else if (!submitData.contactInfo) {
      wx.showToast({
        title: '留个联系方式叭',
        icon: 'none'
      })
      return;
    } */
    // let repliable = await requestNotice('feedback'); // 请求订阅消息推送
    wx.showLoading({
      title: '正在提交...',
      mask: true,
    })
    var data = {
      userInfo: this.data.user.userInfo,
      openDate: new Date(),
      feedbackInfo: submitData.feedbackInfo,
      contactInfo: submitData.contactInfo,
      dealed: false,
      // repliable: repliable,
    };
    if (this.data.cat != undefined) {
      data.cat_id = this.data.cat._id;
      data.cat_name = this.data.cat_name;
    }
    const that = this;
    const res = (await cloud.callFunction({
      name: "curdOp", 
      data: {
        operation: "add",
        collection: "feedback",
        data: data
      }
    })).result;

    console.log("curdOp(add-feedback) result:", res);
    if(res.ok){
      that.setData({
        feedbackId : res.id
      })
      wx.hideLoading();
      await sendNotifyChkFeeedback();
      wx.showToast({
        title: '收到你的反馈啦',
        icon: 'success',
        duration: 1000
      })
    }
    else{
      console.log('repliable record fail:\n');
    }
  },
  
  async toSubmit() {
    let repliable = await requestNotice('feedback'); // 请求订阅消息推送

    const that = this;
    const res = (await cloud.callFunction({
      name: "curdOp", 
      data: {
        operation: "update",
        collection: "feedback",
        item_id: that.data.feedbackId,
        data: { repliable: repliable },
      }
    })).result;

    console.log("curdOp(feedback-update) result:", res);
    if(res.ok){
      wx.navigateBack();
    }
    else{
      console.log('repliable record fail:\n',res);
    }
     
  }
})

