// 审核照片
import { checkAuth, fillUserInfo } from "../../../utils/user";
import { requestNotice, sendVerifyNotice, getMsgTplId } from "../../../utils/msg";
import cache from "../../../utils/cache";
import { signCosUrl } from "../../../utils/common";
import { getCatItem } from "../../../utils/cat";
import { formatDate } from "../../../utils/utils";
import api from "../../../utils/cloudApi";

const app = getApp();

// 审核记录的操作类型
const HISTORY_ACTIONS = {
  pass: { text: '通过', class: 'pass' },
  best: { text: '精选', class: 'best' },
  delete: { text: '删除', class: 'delete' },
  transfer: { text: '转移', class: 'transfer' },
};

Page({

  /**
   * 页面的初始数据
   */
  data: {
    campus_list: {},
    campus_counts: {},
    campusLoading: false,
    hasPhotos: false,
    // 转移照片：目标猫选择弹窗
    showTransferSelect: false,
    // 模式：pending 待审核 / history 审核记录（回溯，所有管理员的审核互相可见）
    mode: 'pending',
    historyList: [],
    historyTotal: 0,
    historyLoading: false,
    historyNoMore: false,
    historyInited: false,
  },

  jsData: {
    // 准备发送通知的列表，姓名：审核详情
    notice_list: {},
    // 原始照片数据（未签名、未填充userInfo），按校区分组
    rawPhotos: {},
    // 已加载完成的校区
    loadedCampus: {},
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    this.jsData.notice_list = {};
    this.jsData.rawPhotos = {};
    this.jsData.loadedCampus = {};

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

  // 仅加载校区标签（不签名URL、不填充userInfo，快速展示标签）
  async loadAllPhotos() {
    wx.showLoading({
      title: '加载校区列表...',
    });

    try {
      // 获取所有未审核照片
      var { result: total_count } = await app.mpServerless.db.collection('photo').count({ verified: false });

      var pools = [];
      for (var i = 0; i < total_count; i += 100) {
        pools.push(
          app.mpServerless.db.collection('photo').find(
            { verified: false },
            { skip: i, limit: 100 }
          )
        );
      }
      var results = await Promise.all(pools);

      // 拼接多个array
      var photos = [];
      for (var r of results) {
        if (r.result) photos = photos.concat(r.result);
      }

      // 并行获取猫信息用于校区分类
      var catIds = [...new Set(photos.map(p => p.cat_id).filter(Boolean))];
      var catCache = {};
      await Promise.all(catIds.map(async id => {
        catCache[id] = await getCatItem(id);
      }));

      // 按校区分组，存入 jsData.rawPhotos
      var campus_counts = {};
      for (var photo of photos) {
        var cat = catCache[photo.cat_id] || {};
        photo.cat = cat;
        var campus = cat.campus || '未知';
        if (!this.jsData.rawPhotos[campus]) {
          this.jsData.rawPhotos[campus] = [];
        }
        this.jsData.rawPhotos[campus].push(photo);
        campus_counts[campus] = (campus_counts[campus] || 0) + 1;
      }

      // 初始化 campus_list 为空数组（点选后再加载）
      var campus_list = {};
      for (var campus in campus_counts) {
        campus_list[campus] = [];
      }

      // 恢复最后一次审批的校区
      var cache_active_campus = cache.getCacheItem("checkPhotoCampus");
      if (!cache_active_campus || !campus_list[cache_active_campus]) {
        cache_active_campus = undefined;
      }

      this.setData({
        campus_list,
        campus_counts,
        hasPhotos: Object.keys(campus_counts).length > 0,
        active_campus: cache_active_campus,
      });

      wx.hideLoading();

      // 如果有缓存的校区，自动加载
      if (cache_active_campus) {
        this.loadCampusPhotos(cache_active_campus);
      }
    } catch (err) {
      console.error('[loadAllPhotos] - 加载失败:', err);
      wx.hideLoading();
    }
  },

  // 加载某个校区的照片（签名URL + 填充userInfo），已加载过则跳过
  async loadCampusPhotos(campus) {
    if (this.jsData.loadedCampus[campus]) return;

    var photos = this.jsData.rawPhotos[campus];
    if (!photos || photos.length === 0) {
      this.jsData.loadedCampus[campus] = true;
      return;
    }

    this.setData({ campusLoading: true });

    try {
      // 并行签名URL（原来逐张串行，现在并行大幅提速）
      await Promise.all(photos.map(async p => {
        p.photo_id = await signCosUrl(p.photo_id);
      }));

      // 填充上传者信息
      await fillUserInfo(photos, "_openid", "userInfo");

      this.jsData.loadedCampus[campus] = true;
      this.setData({
        [`campus_list.${campus}`]: photos,
        campusLoading: false,
      });
    } catch (err) {
      console.error('[loadCampusPhotos] - 加载校区照片失败:', err);
      this.setData({ campusLoading: false });
    }
  },

  bindClickCampus(e) {
    var campus = e.currentTarget.dataset.key;
    if (this.data.active_campus == campus) {
      return;
    }
    this.setData({
      active_campus: campus
    });

    // 未加载过的校区才触发加载
    if (!this.jsData.loadedCampus[campus]) {
      this.loadCampusPhotos(campus);
    }
  },

  // 切换 待审核 / 审核记录
  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;
    this.setData({ mode });
    if (mode === 'history' && !this.data.historyInited) {
      this.loadHistory(true);
    }
  },

  // 触底加载更多审核记录
  onReachBottom() {
    if (this.data.mode === 'history') {
      this.loadHistory(false);
    }
  },

  // 加载审核记录（回溯：所有管理员审核过的内容）
  async loadHistory(reset) {
    if (this.data.historyLoading) return;
    if (!reset && this.data.historyNoMore) return;

    this.setData({ historyLoading: true });
    try {
      const skip = reset ? 0 : this.data.historyList.length;
      const res = await api.managePhoto({
        type: 'history',
        skip: skip,
        limit: 20,
      });

      if (!res.result) {
        wx.showToast({ title: res.msg || '加载失败', icon: 'none' });
        this.setData({ historyLoading: false });
        return;
      }

      const list = res.data.list || [];

      // 并行获取猫信息（含转移目标猫）
      const catIds = [...new Set(list.map(p => p.cat_id).filter(Boolean))];
      const catCache = {};
      await Promise.all(catIds.map(async id => {
        catCache[id] = await getCatItem(id);
      }));

      // 签名缩略图
      await Promise.all(list.map(async p => {
        if (p.thumb) {
          try { p.thumb = await signCosUrl(p.thumb); } catch (e) { /* 已删除的图片签名失败，显示占位 */ }
        }
        const cat = catCache[p.cat_id] || {};
        p.cat_name = cat.name || '未知猫猫';
        const act = HISTORY_ACTIONS[p.action] || { text: p.action, class: '' };
        p.action_text = act.text;
        p.action_class = act.class;
        p.check_time_formatted = p.check_time ? formatDate(p.check_time, 'yyyy-MM-dd hh:mm') : '';
      }));

      // 填充审核人、上传者昵称
      await fillUserInfo(list, 'manager_openid', 'managerInfo');
      await fillUserInfo(list, 'uploader_openid', 'uploaderInfo');

      const newList = reset ? list : this.data.historyList.concat(list);
      this.setData({
        historyList: newList,
        historyTotal: res.data.total || 0,
        historyLoading: false,
        historyInited: true,
        historyNoMore: newList.length >= (res.data.total || 0),
      });
    } catch (err) {
      console.error('[loadHistory] - 加载审核记录失败:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
      this.setData({ historyLoading: false });
    }
  },

  // 审核记录中的图片加载失败（如已删除的照片）
  onHistoryImgError(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      [`historyList[${index}].imgError`]: true,
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

    // 标记后自动滚动到下一张照片
    if (mark_type !== "") {
      const nextIndex = index + 1;
      if (nextIndex < photos.length) {
        // 查询下一张照片的位置并滚动过去
        const query = wx.createSelectorQuery();
        query.select(`#photo-${nextIndex}`).boundingClientRect();
        query.selectViewport().scrollOffset();
        query.exec(res => {
          if (res[0] && res[1] != null) {
            const itemTop = res[0].top;       // 元素距离视口顶部的距离
            const scrollTop = res[1].scrollTop; // 当前滚动位置
            wx.pageScrollTo({
              scrollTop: scrollTop + itemTop - 20, // 留20rpx上边距
              duration: 300,
            });
          }
        });
      }
    }
  },

  // 确定处理
  async bindCheckMulti(e) {
    var active_campus = this.data.active_campus;
    var photos = this.data.campus_list[active_campus];
    var nums = {}, total_num = 0;
    if (photos == undefined || photos.length == 0) {
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
      nums[photo.mark]++;
      total_num++;
    }

    if (total_num == 0) {
      return false;
    }

    // 有转移标记时，先选择目标猫
    if (nums['transfer'] > 0) {
      this.setData({ showTransferSelect: true });
      return;
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

  // 选择转移目标猫
  async onTransferTargetSelect(e) {
    const targetCat = e.detail;
    this.setData({ showTransferSelect: false });
    if (!targetCat || !targetCat._id) {
      return;
    }

    var active_campus = this.data.active_campus;
    var photos = this.data.campus_list[active_campus];
    var nums = {};
    for (const photo of photos) {
      if (!photo.mark || photo.mark == "") continue;
      nums[photo.mark] = (nums[photo.mark] || 0) + 1;
    }

    var modalRes = await wx.showModal({
      title: '确定批量审核？',
      content: `删除${nums['delete'] || 0}张，通过${nums['pass'] || 0}张，精选${nums['best'] || 0}张，转移${nums['transfer'] || 0}张到「${targetCat.name}」`,
    });

    if (modalRes.confirm) {
      console.log('[onTransferTargetSelect] - 开始处理，转移目标:', targetCat.name);
      await this.doCheckMulti(targetCat._id);
    }

    // 记录一下最后一次审批的cache
    cache.setCacheItem("checkPhotoCampus", active_campus, cache.cacheTime.checkPhotoCampus);
  },

  onTransferSelectClose() {
    this.setData({ showTransferSelect: false });
  },

  // 开始批量处理
  async doCheckMulti(transfer_cat_id) {
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
    var transferFailCount = 0;
    for (const photo of photos) {
      if (!photo.mark || photo.mark == "") {
        new_photos.push(photo);
        continue;
      }

      // 转移：审核通过并移到目标猫名下
      if (photo.mark == "transfer") {
        if (!transfer_cat_id) {
          console.error('[doCheckMulti] - 缺少转移目标猫');
          new_photos.push(photo);
          continue;
        }
        // 先通过审核，再转移归属；读库校验转移结果（旧版云函数会静默失败）
        all_queries.push((async () => {
          await api.managePhoto({
            type: "check",
            photo: photo,
            best: false,
          });
          await api.managePhoto({
            type: "transfer",
            photo: photo,
            target_cat_id: transfer_cat_id,
          });
          const { result: latest } = await app.mpServerless.db.collection('photo').findOne({
            _id: photo._id
          });
          if (!latest || latest.cat_id !== transfer_cat_id) {
            throw new Error('transfer not applied: ' + photo._id);
          }
        })().then(() => {
          this.addNotice(photo, true);
        }).catch(err => {
          console.error('[doCheckMulti] - 转移失败:', err);
          new_photos.push(photo); // 转移失败的留在待审列表，不丢失
          transferFailCount++;
        }));
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

    // 更新校区照片列表和计数
    var newCount = new_photos.length;
    this.setData({
      [`campus_list.${active_campus}`]: new_photos,
      [`campus_counts.${active_campus}`]: newCount,
    });

    if (transferFailCount > 0) {
      wx.showModal({
        title: '部分转移失败',
        content: transferFailCount + ' 张照片转移未生效（云函数可能未更新，请重新部署后重试），已保留在待审列表中',
        showCancel: false,
      });
    } else {
      wx.showToast({
        title: '审核通过',
      });
    }
  },
})
