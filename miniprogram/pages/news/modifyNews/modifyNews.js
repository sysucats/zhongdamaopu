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
        namelength: 0,
        namemaxlength: 30,
        titlelength: 0,
        titlemaxlength: 30,
        length: 0,
        maxlength: 800,
        photos_path: [],
        buttons: [{
            id: 0,
            name: '领养',
            checked: false,
        }, {
            id: 1,
            name: '救助',
            checked: false,
        }, {
            id: 2,
            name: '活动',
            checked: false,
        }, {
            id: 3,
            name: '其他',
            checked: false,
        }],
        modalButtons: [{
            id: 0,
            name: '否',
            checked: true,
        }, {
            id: 1,
            name: '是',
            checked: false,
        }],
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
            for (var i = 0; i < that.data.buttons.length; i++) {
                if (that.data.buttons[i].name == res.data[0].class) {
                    that.data.buttons[i].checked = true;
                }
            }
            var modalButtons = [{
                id: 0,
                name: '否',
                checked: true,
            }, {
                id: 1,
                name: '是',
                checked: false,
            }];
            if (res.data[0].setNewsModal == true) {
                modalButtons = [{
                    id: 0,
                    name: '否',
                    checked: false,
                }, {
                    id: 1,
                    name: '是',
                    checked: true,
                }];
            }
            that.setData({
                news: res.data[0],
                photos_path: res.data[0].photosPath,
                titlelength: res.data[0].title.length,
                length: res.data[0].mainContent.length,
                buttons: that.data.buttons,
                modalButtons: modalButtons,
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

    previewCover: function (event) {
        console.log("Preveiw Image: ", event);
        wx.previewImage({
            urls: [event.currentTarget.dataset.url]
        })
    },

    bindInputName(e) {
        var inputData = e.detail.value;
        this.setData({
            namelength: inputData.length
        })
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

    radioButtonTap: function (e) {
        console.log("Radio Button Tap: ", e);
        let id = e.currentTarget.dataset.id
        console.log(id)
        for (let i = 0; i < this.data.buttons.length; i++) {
          if (this.data.buttons[i].id == id) {
            this.data.buttons[i].checked = true;
          } else {
            this.data.buttons[i].checked = false;
          }
        }
        this.setData({
          buttons: this.data.buttons
        })
      },
    
      radioModalButtonTap: function (e) {
        let id = e.currentTarget.dataset.id;
        var mb = this.data.modalButtons;
        for (let i = 0; i < mb.length; i++) {
            if (mb[i].id == id) {
                mb[i].checked = true;
            } else {
                mb[i].checked = false;
            }
        }
        this.setData({
            modalButtons: mb
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

        var date = new Date();
        var year = date.getFullYear();
        var month = date.getMonth() + 1;
        var day = date.getDate();
        var hour = date.getHours();
        var min = date.getMinutes();
        var date_str = year.toString() + "-" +
            (month < 10 ? "0" + month.toString() : month.toString()) + "-" +
            (day < 10 ? "0" + day.toString() : day.toString()) + " " +
            (hour < 10 ? "0" + hour.toString() : hour.toString()) + ":" +
            (min < 10 ? "0" + min.toString() : min.toString());

        var classBelongto = "";
        for (let i = 0; i < this.data.buttons.length; i++) {
            if (this.data.buttons[i].checked == true) {
                classBelongto = this.data.buttons[i].name;
            }
        }

        var setNewsModal = false;
        if (this.data.modalButtons[1].checked == true) {
            setNewsModal = true;
        }

        var data = {
            userInfoLastModify: this.data.user.userInfo,
            userNicknameLastModify: submitData.name,
            ddateLastModify: date_str,
            title: submitData.title,
            mainContent: submitData.mainContent,
            class: classBelongto,
            setNewsModal: setNewsModal,
        }

        const db = wx.cloud.database();
        const that = this;

        wx.showModal({
            content: '确认修改',
            success: function (sm) {
                console.log(sm);
                if (sm.confirm) {

                    db.collection('news').where({
                        "_id": that.data.news_id
                    }).update({
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