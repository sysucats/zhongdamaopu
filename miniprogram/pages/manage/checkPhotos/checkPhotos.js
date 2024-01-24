// 审核照片
import { checkAuth, fillUserInfo } from "../../../utils/user";
import { sleep } from "../../../utils/utils";
import { requestNotice, sendVerifyNotice, getMsgTplId } from "../../../utils/msg";
import cache from "../../../utils/cache";
import { getCatItem } from "../../../utils/cat";
import { cloud } from "../../../utils/cloudAccess";
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
    // 准备发送通知的列表，姓名：审核详情
    notice_list: {},
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    this.jsData.notice_list = {};

    if (await checkAuth(this, 1)) {
      this.loadAllPhotos();
    }
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {
    console.log('[onUnload] - 页面退出');

    // 发送审核消息
    sendVerifyNotice(this.jsData.notice_list);
  },

  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  },

  async loadPhotosAndFillUserInfo(skip_i) {
    const db = await cloud.databaseAsync();
    var res = await db.collection("photo").where({verified: false}).skip(skip_i).limit(20).get();
    await fillUserInfo(res.data, "_openid", "userInfo");
    return res;
  },

  async loadAllPhotos() {
    wx.showLoading({
      title: '加载中...',
    });
    const db = await cloud.databaseAsync();
    // 获取所有照片
    var total_count = (await db.collection('photo').where({
      verified: false
    }).count()).total;

    var pools = [];
    for (var i=0; i<total_count; i+=20) {
      pools.push(this.loadPhotosAndFillUserInfo(i));
    }

    var photos = await Promise.all(pools);
    
    // 拼接多个array
    photos = photos.map(x => x.data);
    photos = Array.prototype.concat.apply([], photos);

    var campus_list = {};
    var memory_cache = {};
    for (var photo of photos) {
      if (memory_cache[photo.cat_id]) {
        photo.cat = memory_cache[photo.cat_id];
      } else {
        photo.cat = await getCatItem(photo.cat_id);
        memory_cache[photo.cat_id] = photo.cat;
      }

      // 分类记录到campus里
      var campus = photo.cat.campus;
      if (!campus_list[campus]) {
        campus_list[campus] = [];
      }
      // console.log("[loadAllPhotos] - ", campus, photo);
      campus_list[campus].push(photo);
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
    
    await wx.hideLoading();
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

  async requestSubscribeMessage() {
    const notifyVerifyPhotoTplId = getMsgTplId("notifyVerify");
    wx.getSetting({
      withSubscriptions: true,
      success: res => {
        console.log("[requestSubscribeMessage] - subscribeSet:", res);
        if ('subscriptionsSetting' in res) {
          if (!(notifyVerifyPhotoTplId in res['subscriptionsSetting'])) {
            // 第一次申请或只点了取消，未永久拒绝也未允许
            requestNotice('notifyVerify');
            // console.log("firstRequest");
          } else if (res.subscriptionsSetting[notifyVerifyPhotoTplId] === 'reject') {
            // console.log("已拒绝");// 不再请求/重复弹出toast
          } else if (res.subscriptionsSetting[notifyVerifyPhotoTplId] === 'accept') {
            console.log('[requestSubscribeMessage] - 重新请求下个一次性订阅');
            requestNotice('notifyVerify');
          }
        }
      }
    })
  },

  openBigPhoto(e) {
    const pid = e.currentTarget.dataset.pid;
    wx.previewImage({
      urls: [pid]
    });
  },

  // 添加一条通知记录，等页面退出的时候统一发送通知
  addNotice(photo, accepted) {
    const openid = photo._openid;
    if (!this.jsData.notice_list[openid]) {
      this.jsData.notice_list[openid] = {
        accepted: 0,
        deleted: 0,
      }
    }
    if (accepted) {
      this.jsData.notice_list[openid].accepted++;
    } else {
      this.jsData.notice_list[openid].deleted++;
    }
  },

  // 点击所属猫猫名称，可以跳转到猫猫详情
  toCatDetail(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    wx.navigateTo({
      url: '/pages/genealogy/detailCat/detailCat?cat_id=' + cat_id,
    })
  },

  // 标记照片
  bindMark(e) {
    const index = e.currentTarget.dataset.index;
    var mark_type = e.currentTarget.dataset.type;
    var active_campus = this.data.active_campus;
    var photos = this.data.campus_list[active_campus];

    if (photos[index].mark == mark_type) {
      mark_type = "";  // 反选
    }
    this.setData({
      [`campus_list.${active_campus}[${index}].mark`]: mark_type
    });
  },

  // 确定处理
  async bindCheckMulti(e) {
    var active_campus = this.data.active_campus;
    var photos = this.data.campus_list[active_campus];
    var nums = {}, total_num = 0;
    if(photos == undefined || photos.length == 0){
      wx.showToast({
        title: '无审核图片',
      });
      return;
    }
    
    for (const photo of photos) {
      if (!photo.mark || photo.mark == "") {
        continue;
      }
      if (!(photo.mark in nums)) {
        nums[photo.mark] = 0;
      }
      nums[photo.mark] ++;
      total_num ++;
    }

    if (total_num == 0) {
      return false;
    }
    
    var modalRes = await wx.showModal({
      title: '确定批量审核？',
      content: `删除${nums['delete'] || 0}张，通过${nums['pass'] || 0}张，精选${nums['best'] || 0}张`,
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
    var photos = this.data.campus_list[active_campus];
    const mask2type = {
      "delete": "delete",
      "pass": "check",
      "best": "check",
    }
    var all_queries = [], new_photos = [];
    for (const photo of photos) {
      if (!photo.mark || photo.mark == "") {
        new_photos.push(photo);
        continue;
      }

      // 准备数据
      var data = {
        type: mask2type[photo.mark],
        photo: photo,
        best: photo.mark == "best",
      }

      all_queries.push(api.managePhoto(data))
      this.addNotice(photo, (photo.mark != "delete"));
    }
    // 阻塞一下
    await Promise.all(all_queries);
    this.setData({
      [`campus_list.${active_campus}`]: new_photos,
    });

    wx.showToast({
      title: '审核通过',
    });
  },
})