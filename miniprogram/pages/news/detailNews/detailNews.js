// pages/news/detailNews/detailNews.js
const utils = require('../../../utils.js');
const config = require('../../../config.js');
const use_wx_cloud = config.use_wx_cloud; // 是否使用微信云，不然使用Laf云
const cloud = use_wx_cloud ? wx.cloud : require('../../../cloudAccess.js').cloud;

const isManager = utils.isManager;
const shareTo = utils.shareTo;
const getCurrentPath = utils.getCurrentPath;
const formatDate = utils.formatDate;


Page({

    /**
     * 页面的初始数据
     */
    data: {
        news_id: 0,
        news: 0,
        showManager: false,
        updateRequest: false,
        err: false,
        photos_path: [],
        cover_path: "",
    },

    /**
     * 生命周期函数--监听页面加载
     */
    onLoad: function (options) {
        this.setData({
            news_id: options.news_id
        })
        this.loadNews();
        this.checkAuth();
    },

    /**
     * 页面相关事件处理函数--监听用户下拉动作
     */
    onPullDownRefresh: function () {
        this.onRefresh();
    },

    // 下拉刷新
    onRefresh() {
        this.setData({
            updateRequest: true
        })
        this.loadNews();
        const that = this;
        setTimeout(function () {
            that.setData({
                updateRequest: false
            })
        }, 1000)
        wx.stopPullDownRefresh();
    },

    checkAuth() {
        const that = this;
        isManager(function (res) {
            if (res) {
                that.setData({
                    showManager: true
                });
            }
        }, 2)
    },

    /**
     * 用户点击右上角分享
     */
    onShareAppMessage: function () {
        const pagesStack = getCurrentPages();
        const path = getCurrentPath(pagesStack);
        const share_text = `${this.data.news.title}`;
        console.log(shareTo(share_text, path))
        return shareTo(share_text, path);
    },

    loadNews() {
        const that = this;
        const db = cloud.database();
        db.collection('news').doc(that.data.news_id).get().then(res => {
            console.log("News Detail:", res);
            if (!res.data) {
              that.setData({
                  err: true,
              })
              return;
            }

            var news = res.data;
            news.ddate = formatDate(new Date(news.date), "yyyy年MM月dd日 hh:mm:ss");
            if (news.dateLastModify) {
              news.ddateLastModify = formatDate(new Date(news.dateLastModify), "yyyy年MM月dd日 hh:mm:ss");
            }
            that.setData({
                news: news,
                photos_path: news.photosPath,
                cover_path: news.coverPath,
            })
        });
    },

    previewImg: function (event) {
        const that = this;
        console.log("Preveiw Image: ", event);
        wx.previewImage({
            current: that.data.photos_path[event.currentTarget.dataset.index],
            urls: that.data.photos_path
        })
    },


    modifyNews() {
        const detail_url = '/pages/news/modifyNews/modifyNews';
        wx.navigateTo({
            url: detail_url + '?news_id=' + this.data.news_id,
        });
    },

    _doRemove(item_id) {
        if(use_wx_cloud){ // 使用微信云
            cloud.callFunction({
                name: "newsOp",
                data: {
                  type: "delete",
                  item_id: item_id,
                }
            }).then((res) => {
                console.log(res);
                if (!res) {
                    wx.showToast({
                        icon: 'none',
                        title: '删除失败',
                    });
                    return;
                }
                setTimeout(wx.navigateBack, 1000);
            });
        }
        else{ // 使用 Laf 云
            cloud.invokeFunction("newsOp", {
                type: "delete",
                item_id: item_id
            }).then((res) => {
                console.log(res);
                if (!res) {
                    wx.showToast({
                        icon: 'none',
                        title: '删除失败',
                    });
                    return;
                }
                setTimeout(wx.navigateBack, 1000);
            });
        }
    },

    removeNews() {
        if (this.data.showManager == false) {
            return;
        }
        
        var that = this;
        wx.showModal({
            content: '确定要删除吗？',
            success: function (sm) {
                console.log(sm);
                if (sm.confirm) {
                  that._doRemove(that.data.news_id);
                }
            }
        })
    },
})