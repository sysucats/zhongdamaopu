import { getAvatar } from "../../../utils/cat";
// 处理反馈
import { formatDate } from "../../../utils/utils";
import { requestNotice, getMsgTplId } from "../../../utils/msg";
import { checkAuth, fillUserInfo } from "../../../utils/user";
import api from "../../../utils/cloudApi";

const step = 6;
const app = getApp();

Page({

  /**
   * 页面的初始数据
   */
  data: {
    feedbacks: [],
    total: 0,
    pendingCount: 0,
    loading: false,
    loadError: '',
    checkHistory: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    if (await checkAuth(this, 1)) {
      this.reload();
      // 监听反馈更新时间
      app.globalData.eventBus.$on('feedbackUpdated', this.handleFeedbackUpdate);
    }
  },
  handleFeedbackUpdate: function(payload) {
    console.log('收到反馈更新事件:', payload);
    
    // 更新特定反馈项
    const feedbacks = this.data.feedbacks.map(fb => {
      if (fb._id === payload.id) {
        return {
          ...fb,
          replied: true,
          replyDate: new Date(),
          replyDateStr: formatDate(new Date(), "yyyy-MM-dd hh:mm:ss"),
          replyInfo: payload.replyInfo
        };
      }
      return fb;
    });
    
    this.setData({ feedbacks });
  },



  async loadFeedbacks() {
    const nowLoaded = this.data.feedbacks.length;
    var { result: feedbacks } = await app.mpServerless.db.collection('feedback').find({ dealed: this.data.checkHistory }, { sort: { openDate: -1 }, skip: nowLoaded, limit: step })
    console.log("[loadFeedbacks] -", feedbacks);
    // 填充userInfo
    await fillUserInfo(feedbacks, "openid", "userInfo");
    // 获取对应猫猫信息；将Date对象转化为字符串；判断是否已回复
    for (let i = 0; i < feedbacks.length; ++i) {
      if (feedbacks[i].cat_id != undefined) {
        const { result: cat } = await app.mpServerless.db.collection('cat').findOne({ _id: feedbacks[i].cat_id }, {
          projection: { name: 1, campus: 1, area: 1 }
        })
        feedbacks[i].cat = cat;
        try {
          const avatar = cat ? await getAvatar(feedbacks[i].cat_id) : null;
          feedbacks[i].cat_avatar = avatar?.photo_compressed || avatar?.photo_id || '/pages/public/images/info/default_avatar.png';
        } catch (error) {
          feedbacks[i].cat_avatar = '/pages/public/images/info/default_avatar.png';
        }
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

  async refreshStatus() {
    await this.requestSubscribeMessage();
    await this.reload();
  },

  async reload() {
    this.setData({ loading: true, loadError: '' });
    try {
      const [pending, processed] = await Promise.all([
        app.mpServerless.db.collection('feedback').count({ dealed: false }),
        app.mpServerless.db.collection('feedback').count({ dealed: true }),
      ]);
      const count = value => typeof value === 'number' ? value : (value?.total ?? value?.count ?? 0);
      this.setData({ pendingCount: count(pending.result), total: count(this.data.checkHistory ? processed.result : pending.result), feedbacks: [] });
      await this.loadFeedbacks();
    } catch (error) {
      this.setData({ loadError: '反馈加载失败，请点击下方刷新重试。' });
    } finally {
      this.setData({ loading: false });
    }
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
      complete: res => {
        console.log("[requestSubscribeMessage] - complete:", res);
      }
    })
  },

  async onReachBottom() {
    if (this.data.loading || this.data.loadError) return;
    if (this.data.feedbacks.length >= this.data.total) {
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
    this.setData({ loading: true });
    try { await this.loadFeedbacks(); }
    catch (error) { this.setData({ loadError: '反馈加载失败，请点击下方刷新重试。' }); }
    finally { this.setData({ loading: false }); wx.hideLoading(); }
  },

  async bindCheck(e) {
    const feedback = e.currentTarget.dataset.feedback;
    const modalRes = await wx.showModal({
      title: '标为已处理？',
      content: '确认这条反馈已处理完成？确认后将移入“已处理”列表。',
      confirmText: '确认标记',
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
      total: this.data.total - 1,
      pendingCount: Math.max(0, this.data.pendingCount - 1)
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
      url: '/pages/manage/catManage/catManage?cat_id=' + cat_id + '&activeTab=info',
    });
  },

  toReply(e) {
    const fb_id = e.currentTarget.dataset.fbid;
    wx.navigateTo({
      url: '/pages/manage/replyFeedback/replyFeedback?fb_id=' + fb_id,
    })
  },

  switchHistory(event) {
    const next = event.currentTarget.dataset.history;
    if (this.data.loading || next === this.data.checkHistory) return;
    this.setData({ checkHistory: next });
    return this.reload();
  },
})
