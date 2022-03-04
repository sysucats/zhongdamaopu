// 审核照片
const utils = require('../../../utils.js');
const regeneratorRuntime = utils.regeneratorRuntime;
const randomInt = utils.regeneratorRuntime;
const isManager = utils.isManager;

const msg = require('../../../msg.js');
const requestNotice = msg.requestNotice;
const sendVerifyNotice = msg.sendVerifyNotice;
// const verifyTplId = msg.verifyTplId;

const config = require('../../../config.js');
const notifyVerifyPhotoTplId = config.msg.notifyVerify.id;
const text_cfg = config.text;

// 准备发送通知的列表，姓名：审核详情
var notice_list = {};

Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    total: '-',
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    notice_list = {};
    this.checkAuth();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {
    console.log('页面退出');

    // 自动数猫图
    wx.cloud.callFunction({
      name: "countPhoto",
      success: (res) => {
        console.log('数猫图完成', res.result);
      }
    });

    // 后台处理缩略图和水印图
    wx.cloud.callFunction({
      name: "imProcess",
      data: {
        app_name: text_cfg.app_name
      },
      success: (res) => {
        console.log('图片处理完成', res.result);
      }
    });

    // 发送审核消息
    sendVerifyNotice(notice_list);

    // 重新计算拍照月榜
    wx.cloud.callFunction({
      name: "getPhotoRank",
      success: (res) => {
        console.log('拍照月榜完成', res.result);
      }
    });
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  },
  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  },
  // 检查权限
  checkAuth() {
    const that = this;
    isManager(function (res) {
      if (res) {
        that.setData({
          auth: true
        });
        that.reload();
      } else {
        that.setData({
          tipText: '只有管理员Level-1能进入嗷',
          tipBtn: true,
        });
        console.log("Not a manager.");
      }
    }, 1)
  },
  async loadPhotos() {
    const db = wx.cloud.database();
    var photos = (await db.collection('photo').where({
      verified: false
    }).get()).data;
    for (var ph of photos) {
      var cat = (await db.collection('cat').doc(ph.cat_id).get()).data;
      ph.cat = cat
    }
    console.log(photos);
    this.setData({
      photos: photos
    });
    return true;
  },

  reload() {
    this.requestSubscribeMessage() //判断是否弹出订阅消息设置
    wx.showLoading({
      title: '加载中...',
    });
    const that = this;
    const db = wx.cloud.database();
    db.collection('photo').where({
      verified: false
    }).count().then(res => {
      console.log(res);
      that.setData({
        total: res.total
      });
      that.loadPhotos().then(() => {
        wx.hideLoading();
      });

    });
  },

  async requestSubscribeMessage() {
    // if (this.data.total <= 2) { //最多剩余几张照片可更新订阅状态，TODO:待更改
    if (this.data.total >= 0) { 
      wx.getSetting({
        withSubscriptions: true,
        success: res => {
          console.log("subscribeSet:", res);
          if ('subscriptionsSetting' in res) {
            if (!(notifyVerifyPhotoTplId in res['subscriptionsSetting'])) {
              // 第一次申请或只点了取消，未永久拒绝也未允许
              requestNotice('notifyVerify');
              // console.log("firstRequest");
            } else if (res.subscriptionsSetting[notifyVerifyPhotoTplId] === 'reject') {
              // console.log("已拒绝");// 不再请求/重复弹出toast
            } else if (res.subscriptionsSetting[notifyVerifyPhotoTplId] === 'accept') {
              console.log('重新请求下个一次性订阅');
              requestNotice('notifyVerify');
            }
          }
        }
      })
      // if(subscribeSetting['mainSwitch']){} //本小程序订阅消息总开关
    }
  },
  bindCheck(e) {
    const photo = e.currentTarget.dataset.photo;
    const best = e.currentTarget.dataset.best;
    const that = this;
    wx.showModal({
      title: '提示',
      content: '确定通过审核' + (best ? '+精选' : '') + '？',
      success(res) {
        if (res.confirm) {
          console.log('开始通过');
          wx.cloud.callFunction({
            name: "managePhoto",
            data: {
              type: "check",
              photo: photo,
              best: best
            }
          }).then(res => {
            console.log("审核通过：" + photo._id);
            console.log(res.data);
            // 内存记录一下这个操作，用来发通知
            that.addNotice(photo, true);

            // 直接从列表里去掉这只猫，不完全加载了
            const photos = that.data.photos;
            const new_photos = photos.filter((ph, index, arr) => {
              // 这个photo是用户点击的photo，在上面定义的
              return ph._id != photo._id;
            });
            that.setData({
              photos: new_photos,
              total: that.data.total - 1
            }, () => {
              wx.showToast({
                title: '审核通过',
              });
            });

          })
        }
      }
    })
  },

  bindDelete(e) {
    const photo = e.currentTarget.dataset.photo;
    const that = this;
    wx.showModal({
      title: '提示',
      content: '确定删除？',
      success(res) {
        if (res.confirm) {
          console.log('开始删除');
          wx.cloud.callFunction({
            name: "managePhoto",
            data: {
              type: "delete",
              photo: photo
            }
          }).then(res => {
            console.log("删除照片记录：" + photo._id);
            // 内存记录一下这个操作，用来发通知
            that.addNotice(photo, false);

            // 直接从列表里去掉这只猫，不完全加载了
            const photos = that.data.photos;
            const new_photos = photos.filter((ph, index, arr) => {
              // 这个photo是用户点击的photo，在上面定义的
              return ph._id != photo._id;
            });
            that.setData({
              photos: new_photos,
              total: that.data.total - 1
            }, () => {
              wx.showToast({
                title: '删除成功',
              });
            });
          })
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

  // 点击所属猫猫名称，可以跳转到猫猫详情
  toCatDetail(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    wx.navigateTo({
      url: '/pages/genealogy/detailCat/detailCat?cat_id=' + cat_id,
    })
  },
})