// 处理反馈
import { formatDate } from "../../../utils/utils";
import { requestNotice, getMsgTplId } from "../../../utils/msg";
import { checkAuth, fillUserInfo } from "../../../utils/user";
import { cloud } from "../../../utils/cloudAccess";
import api from "../../../utils/cloudApi";

const step = 6;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    feedbacks: [],
    total: 0,
    checkHistory: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    if (await checkAuth(this, 1)) {
      this.reload();
    }
  },

  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  },

  async loadFeedbacks() {
    const db = await cloud.databaseAsync();
    const nowLoaded = this.data.feedbacks.length;
    var feedbacks = (await db.collection('feedback').where({
      dealed: this.data.checkHistory
    }).orderBy('openDate', 'desc').skip(nowLoaded).limit(step).get()).data;
    console.log("[loadFeedbacks] -", feedbacks);
    // 填充userInfo
    await fillUserInfo(feedbacks, "openid", "userInfo");
    // 获取对应猫猫信息；将Date对象转化为字符串；判断是否已回复
    for (let i = 0; i < feedbacks.length; ++i) {
      if (feedbacks[i].cat_id != undefined) {
        feedbacks[i].cat = (await db.collection('cat').doc(feedbacks[i].cat_id).field({
          name: true,
          campus: true
        }).get()).data;
      }
      feedbacks[i].openDateStr = formatDate(feedbacks[i].openDate, "yyyy-MM-dd hh:mm:ss");
      feedbacks[i].replied = feedbacks[i].hasOwnProperty('replyDate');
      if (feedbacks[i].replied) {
        feedbacks[i].replyDateStr = formatDate(feedbacks[i].replyDate, "yyyy-MM-dd hh:mm:ss");
      }
    }
    this.data.feedbacks.push(...feedbacks);
    this.setData({
      feedbacks: this.data.feedbacks
    });
  },

  async refreshStatus(){
    await this.requestSubscribeMessage();
    await this.reload();
  },
  
  async reload() {
    wx.showLoading({
      title: '加载中...',
    });
    const db = await cloud.databaseAsync();
    var fbRes = await db.collection('feedback').where({
      dealed: this.data.checkHistory
    }).count();

    console.log("[reload] - feedbacks: ", fbRes);
    this.setData({
      total: fbRes.total,
    });
    this.data.feedbacks = []; // 清空，loadFeedbacks再填充
    await this.loadFeedbacks();
    wx.hideLoading();
  },

  async requestSubscribeMessage() {
    const notifyChkFeedbackTplId = getMsgTplId("notifyChkFeedback");
    wx.getSetting({
      withSubscriptions: true,
      success: res => {
        console.log("[requestSubscribeMessage] - subscribeSet:", res);
        if ('subscriptionsSetting' in res) {
          if (!(notifyChkFeedbackTplId in res['subscriptionsSetting'])) {
            // 第一次请求
            requestNotice('notifyChkFeedback');
            // console.log("[requestSubscribeMessage] - firstRequest");
          } else if (res.subscriptionsSetting[notifyChkFeedbackTplId] === 'reject') {
            // console.log("已拒绝");// 不再请求/重复弹出toast
            // requestNotice('notifyChkFeedback');
          } else if (res.subscriptionsSetting[notifyChkFeedbackTplId] === 'accept') {
            console.log('[requestSubscribeMessage] - 重新请求下个一次性订阅');
            requestNotice('notifyChkFeedback');
          }
        }
      },
      complete:res=>{
        console.log("[requestSubscribeMessage] - complete:",res);
      }
    })
  },

  async onReachBottom() {
    if (this.data.feedbacks.length == this.data.total) {
      wx.showToast({
        title: '已无更多反馈',
        icon: 'none',
        duration: 500
      });
      return;
    }
    wx.showLoading({
      title: '加载更多反馈..',
      mask: true
    });
    await this.loadFeedbacks();
    wx.hideLoading();
  },

  async bindCheck(e) {
    const feedback = e.currentTarget.dataset.feedback;
    const modalRes = await wx.showModal({
      title: '提示',
      content: '确定已完成该反馈处理？',
    })
    if (!modalRes.confirm) {
      return;
    }

    console.log('[bindCheck] - 确认反馈处理');
    await api.curdOp({
      operation: 'update',
      collection: "feedback",
      item_id: feedback._id,
      data: {
        dealed: true,
        dealDate: api.getDate()
      }
    });

    console.log("[bindCheck] - 反馈已处理：" + feedback._id);
    // 直接从列表里去掉这个反馈，不完全加载了
    const feedbacks = this.data.feedbacks;
    const new_feedbacks = feedbacks.filter((fb) => {
      // 这个feedback是用户点击的feedback，在上面定义的
      return fb._id != feedback._id;
    });
    this.setData({
      feedbacks: new_feedbacks,
      total: this.data.total - 1
    });
    wx.showToast({
      title: '反馈已处理',
    });
  },

  bindCopy(e) {
    const item = e.currentTarget.dataset.feedback;
    wx.setClipboardData({
      data: (item.cat ? ("所属猫猫：" + item.cat.name + '（' + item.cat.campus + '）') : '反馈来源：关于页-信息反馈') + "\n反馈内容：" + item.feedbackInfo + "\n反馈人：" + item.userInfo.nickName + "\n联系方式：" + (item.contactInfo || "对方没有留下联系方式") + "\n反馈时间：" + item.openDateStr,
    });
  },

  // 点击所属猫猫名称，可以跳转到猫猫详情
  toCatDetail(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    wx.navigateTo({
      url: '/pages/genealogy/detailCat/detailCat?cat_id=' + cat_id,
    })
  },

  // 长按所属猫猫名称，可以跳转到猫信息修改
  toCatManage(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    wx.navigateTo({
      url: '/pages/manage/addCat/addCat?cat_id=' + cat_id,
    });
  },

  toReply(e) {
    const fb_id = e.currentTarget.dataset.fbid;
    wx.navigateTo({
      url: '/pages/manage/replyFeedback/replyFeedback?fb_id=' + fb_id,
    })
  },

  switchHistory(event) {
    this.data.checkHistory = !this.data.checkHistory;
    this.reload();
    this.setData({
      checkHistory: this.data.checkHistory
    });
  }
})