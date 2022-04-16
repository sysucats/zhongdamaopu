// miniprogram/pages/news/news.js
const utils = require('../../utils.js');

const isManager = utils.isManager;


Page({
    data: {
        newsList: [],
        updateRequest: false,
        showManager: false
    },

    /**
     * 生命周期函数--监听页面加载
     */
    onLoad: function (options) {
        const that = this;
        const db = wx.cloud.database();
        db.collection('news').orderBy('date', 'desc').get().then(res => {
            that.setData({
                newsList: res.data
            })
        });
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
        this.getData();
        this.setData({
            updateRequest: true,
        })
    },

    // 重新载入数据库
    getData() {
        const that = this;
        const db = wx.cloud.database();
        db.collection('news').orderBy('date', 'desc').get().then(res => {
            that.setData({
                newsList: res.data,
            })
        });

        wx.stopPullDownRefresh();

        setTimeout(function () {
            that.setData({
                updateRequest: false,
            })
        }, 1000)
    },

    clickNews(e) {
        const news_id = e.currentTarget.dataset.news_id;
        const detail_url = '/pages/news/detailNews/detailNews';
        wx.navigateTo({
            url: detail_url + '?news_id=' + news_id,
        });
    },

    clickScience() {
        wx.navigateTo({
            url: '/pages/science/science'
        });
    },

    clickCreateBtn(e) {
        wx.navigateTo({
            url: '/pages/news/newAnnounce/newAnnounce',
        });
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

})