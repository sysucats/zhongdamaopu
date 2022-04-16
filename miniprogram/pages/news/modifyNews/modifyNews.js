// pages/news/modifyNews/modifyNews.js

const utils = require('../../../utils.js');
const user = require('../../../user.js');
const isManager = utils.isManager;

const getCurUserInfoOrFalse = user.getCurUserInfoOrFalse;

Page({

    /**
     * 页面的初始数据
     */
    data: {
        news_id: 0,
        news: 0,
        isAuth: false,
        auth: false,
        user: {},
        titlelength: 0,
        titlemaxlength: 30,
        length: 0,
        maxlength: 800,
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
        wx.enableAlertBeforeUnload({
            message: "确认退出？修改未提交"
          });
    },

    // 检查权限
    checkAuth() {
        const that = this;
        isManager(function (res) {
            if (res) {
                that.setData({
                    auth: true
                });
            }
        }, 2)
    },

    loadNews() {
        const that = this;
        const db = wx.cloud.database();
        db.collection('news').where({
            "_id": this.data.news_id
        }).get().then(res => {
            console.log("News Detail:", res);
            that.setData({
                news: res.data[0],
            })
        });
    },

    bindInputTitle(e) {
        var inputData = e.detail.value;
        this.setData({
            titlelength: inputData.length
        })
    },

    bindInput(e) {
        var inputData = e.detail.value;
        this.setData({
            length: inputData.length
        })
    },

    getUInfo() {
        const that = this;
        getCurUserInfoOrFalse().then(res => {
            if (!res) {
                console.log('未授权');
                return;
            }
            console.log(res);
            that.setData({
                isAuth: true,
                user: res,
            });
        });
    },

    async bindSubmit(e) {
        var submitData = e.detail.value;
        console.log(submitData);
        if (!submitData.title) {
            wx.showToast({
                title: '标题不能为空',
                icon: 'none'
            })
            return;
        }

        var data = {
            userInfoLastModify: this.data.user.userInfo,
            ddateLastModify: new Date().toLocaleString(),
            title: submitData.title,
            mainContent: submitData.mainContent,
        }

        const db = wx.cloud.database();
        const that = this;

        wx.showModal({
            content: '确认修改',
            success: function (sm) {
                console.log(sm);
                if (sm.confirm) {

                    db.collection('news').where({"_id": that.data.news_id}).update({
                        data: data,
                        success: (res) => {
                            console.log(res);
                            wx.showToast({
                                title: '修改成功',
                                icon: 'success',
                                duration: 1000
                            })
                            setTimeout(wx.navigateBack, 1000)
                        },
                        fail: console.error
                    })

                }
            }
        })

        

        
        
        
    }
})