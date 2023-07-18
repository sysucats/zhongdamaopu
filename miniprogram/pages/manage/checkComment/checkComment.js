import {
  checkAuth,
  fillUserInfo
} from "../../../utils/user";
import {
  requestNotice,
  sendVerifyCommentNotice,
  getMsgTplId
} from "../../../utils/msg";
import cache from "../../../utils/cache";
import {
  getCatItem
} from "../../../utils/cat";
import {
  cloud
} from "../../../utils/cloudAccess";
import {
  formatDate
} from "../../../utils/utils";
import api from "../../../utils/cloudApi";

Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    campus_list: [],
  },

  jsData: {
    notice_list: [],
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    if (await checkAuth(this, 1)) {
      this.loadComments();
    }
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {
    console.log('[onUnload] - 页面退出');

    // 发送审核消息
    sendVerifyCommentNotice(this.jsData.notice_list);
  },

  async loadComments() {
    // 常用的对象
    const db = await cloud.databaseAsync();
    const _ = db.command;
    var comments = [];
    var qf = {
      needVerify: _.eq(true),
      deleted: _.neq(true)
    };
    var res = await db.collection('comment').where(qf).orderBy("create_date", "desc").get();
    console.log(res);

    // 填充userInfo
    await fillUserInfo(res.data, "user_openid", "userInfo");
    for (var item of res.data) {
      item.datetime = formatDate(new Date(item.create_date), "yyyy-MM-dd hh:mm:ss")
      comments.push(item);
    }

    // 填充猫猫信息
    var campus_list = {};
    var memory_cache = {};
    for (var c of comments) {
      if (memory_cache[c.cat_id]) {
        c.cat = memory_cache[c.cat_id];
      } else {
        c.cat = await getCatItem(c.cat_id);
        memory_cache[c.cat_id] = c.cat;
      }

      // 分类记录到campus里
      var campus = c.cat.campus;
      if (!campus_list[campus]) {
        campus_list[campus] = [];
      }
      campus_list[campus].push(c);
    }

    // 恢复最后一次审批的校区
    var cache_active_campus = cache.getCacheItem("checkPhotoCampus");
    if (!cache_active_campus || !campus_list[cache_active_campus]) {
      cache_active_campus = undefined
    }

    this.setData({
      campus_list: campus_list,
      active_campus: cache_active_campus,
    })
  },

  bindClickCampus(e) {
    var campus = e.currentTarget.dataset.key;
    var active_campus = this.data.active_campus;
    // console.log(campus);

    if (active_campus == campus) {
      return;
    }

    this.setData({
      active_campus: campus
    });
  },

  // 标记审核
  bindMark(e) {
    const index = e.currentTarget.dataset.index;
    var mark_type = e.currentTarget.dataset.type;
    var active_campus = this.data.active_campus;
    var comments = this.data.campus_list[active_campus];

    if (comments[index].mark == mark_type) {
      mark_type = ""; // 反选
    }
    this.setData({
      [`campus_list.${active_campus}[${index}].mark`]: mark_type
    });
  },

  openBigPhoto(e) {
    const pid = e.currentTarget.dataset.pid;
    wx.previewImage({
      urls: [pid]
    });
  },

  // 点击所属猫猫名称，可以跳转到猫猫详情
  toCatDetail(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    wx.navigateTo({
      url: '/pages/genealogy/detailCat/detailCat?cat_id=' + cat_id,
    })
  },

  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 确定处理
  async bindCheckMulti(e) {
    var active_campus = this.data.active_campus;
    var comments = this.data.campus_list[active_campus];
    var nums = {},
      total_num = 0;
    if (comments == undefined || comments.length == 0) {
      wx.showToast({
        title: '无审核内容',
      });
      return;
    }

    for (const comment of comments) {
      if (!comment.mark || comment.mark == "") {
        continue;
      }
      if (!(comment.mark in nums)) {
        nums[comment.mark] = 0;
      }
      nums[comment.mark]++;
      total_num++;
    }

    if (total_num == 0) {
      return false;
    }

    var modalRes = await wx.showModal({
      title: '确定批量审核？',
      content: `删除${nums['delete'] || 0}条，通过${nums['pass'] || 0}条`,
    });

    if (modalRes.confirm) {
      console.log('[bindCheckMulti] - 开始通过');
      await this.doCheckMulti();
    }

    // 记录一下最后一次审批的cache
    cache.setCacheItem("checkPhotoCampus", active_campus, cache.cacheTime.checkPhotoCampus);
  },

  // 开始批量处理
  async doCheckMulti() {
    wx.showLoading({
      title: '处理中...',
    })
    var active_campus = this.data.active_campus;
    var comments = this.data.campus_list[active_campus];
    var all_queries = [],
      new_comments = [];
    for (const comment of comments) {
      if (!comment.mark || comment.mark == "") {
        new_comments.push(comment);
        continue;
      }

      // 准备数据
      var data = {
        needVerify: false,
      }
      if (comment.mark == 'delete') {
        data.deleted = true;
      }

      all_queries.push(
        api.curdOp({
          operation: "update",
          collection: "comment",
          item_id: comment._id,
          data: data
        }))
      this.addNotice(comment, (comment.mark != "delete"));
    }
    // 阻塞一下
    await Promise.all(all_queries);
    this.setData({
      [`campus_list.${active_campus}`]: new_comments,
    });

    wx.showToast({
      title: '审核通过',
    });
  },

  // 添加一条通知记录，等页面退出的时候统一发送通知
  addNotice(comment, accepted) {
    const openid = comment.user_openid;
    let {notice_list} = this.jsData;
    if (!notice_list[openid]) {
      notice_list[openid] = {
        accepted: 0,
        deleted: 0,
      }
    }
    if (accepted) {
      notice_list[openid].accepted++;
    } else {
      notice_list[openid].deleted++;
    }
  },

  // 管理员点击订阅
  async requestSubscribeMessage() {
    const notifyVerifyTplId = getMsgTplId("notifyVerify");
    wx.getSetting({
      withSubscriptions: true,
      success: res => {
        console.log("[requestSubscribeMessage] - subscribeSet:", res);
        if ('subscriptionsSetting' in res) {
          if (!(notifyVerifyTplId in res['subscriptionsSetting'])) {
            // 第一次申请或只点了取消，未永久拒绝也未允许
            requestNotice('notifyVerify');
            // console.log("firstRequest");
          } else if (res.subscriptionsSetting[notifyVerifyTplId] === 'reject') {
            // console.log("已拒绝");// 不再请求/重复弹出toast
          } else if (res.subscriptionsSetting[notifyVerifyTplId] === 'accept') {
            console.log('[requestSubscribeMessage] - 重新请求下个一次性订阅');
            requestNotice('notifyVerify');
          }
        }
      }
    })
  },

})