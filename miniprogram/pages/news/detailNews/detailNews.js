// pages/news/detailNews/detailNews.js
const { keys } = require('../../../packages/regenerator-runtime/runtime.js');
const utils = require('../../../utils.js');
const isManager = utils.isManager;
const shareTo = utils.shareTo;
const getCurrentPath = utils.getCurrentPath;

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
        const db = wx.cloud.database();
        db.collection('news').where({
            "_id": this.data.news_id
        }).get().then(res => {
            console.log("News Detail:", res);
            if(res.data.length != 0){
                that.setData({
                    news: res.data[0],
                })
            }
            else{
                that.setData({
                    err: true,
                })
            }
        });
    },

    modifyNews() {
        const detail_url = '/pages/news/modifyNews/modifyNews';
        wx.navigateTo({
            url: detail_url + '?news_id=' + this.data.news_id,
        });
    },

    removeNews() {
        if (this.data.showManager == false) {
            return;
        }

        const that = this;
        wx.showModal({
            content: '确定要删除吗？',
            success: function (sm) {
                console.log(sm);
                if (sm.confirm) {

                    if (that.data.news_id) {
                        const db = wx.cloud.database()
                        db.collection('news').doc(that.data.news_id).remove({
                            success: res => {
                                wx.showToast({
                                    title: '删除成功',
                                })
                                that.setData({
                                    news_id: 0,
                                    news: 0,
                                })
                                setTimeout(wx.navigateBack, 1000)
                            },
                            fail: err => {
                                wx.showToast({
                                    icon: 'none',
                                    title: '删除失败',
                                })
                                console.error('数据库删除记录失败：', err)
                            }
                        })
                    }

                }
            }
        })
    },
})