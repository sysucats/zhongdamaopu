// pages/ai/ai.js
const utils = require('../../utils.js');
const randomInt = utils.randomInt;

const config = require('../../config.js');
const fakeData = {
  "ok": true,
  "message": "OK",
  "data": [
    ["988c1b1b5cd5508e0f5752ed394d44ba", 0.6162323951721191],
    ["e62469b25fc5e26600a0b44421474b3c", 0.28938332200050354],
    ["b1a52c595fbb69bf0051a5d8455b3818", 0.09052428603172302]
  ]
};

Page({

  /**
   * 页面的初始数据
   */
  data: {
    lensDirection: 'back',
    src: false,
    cameraAuth: true,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // this.loadCatsResult(fakeData);

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
    this.checkAuth();
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

  async checkAuth(){
    const that = this;
    await wx.getSetting({
      success (res) {
        // console.log("auth:",res.authSetting)
        that.setData({cameraAuth:res.authSetting["scope.camera"]})
      }
    })
  },

  reqCamAuth(){
    const that = this;
    wx.openSetting({
      success (res) {
        // console.log(res.authSetting)
        if (res.authSetting["scope.camera"]===true) {
          that.setData({cameraAuth:true})
        }
      }
    })
  },

  takePhoto() {
    if (this.data.cameraAuth) {
      const ctx = wx.createCameraContext()
      ctx.takePhoto({
        quality: 'high',
        success: (res) => {
          this.setData({
            src: res.tempImagePath
          })
          this.uploadPhoto(res.tempImagePath)
        }
      })
    }
  },
  error(e) {
    //用户不允许使用摄像头时触发
    console.log(e.detail)
  },

  uploadPhoto(filePath) {
    // this.loadCatsResult(fakeData);
    wx.showLoading({
      title: '上传识别中...',
      mask: true,
    })

    wx.uploadFile({
      filePath: filePath,
      name: 'photo',
      url: config.aiUrl,
      // formData: formData,
      // header: header,
      // timeout: 10000,
      success: (result) => {
        console.log("ai result:", result); 
        wx.hideLoading()
        let res = JSON.parse(result.data)// 返回的data是字符串？
        if (res.ok === true) {
          this.loadCatsResult(res) 
        } else {
          // 无识别结果或上传数据格式有错？区分
        }
      },
      fail: (res) => {
        wx.hideLoading()
        wx.showToast({
          title: '上传失败，重新试试吧',
          icon:'error',
          duration:2500
        })
      },
      complete: (res) => {
        // console.log('upload complete',res);
      },
    })
  },

  async loadCatsResult(catRes) {
    wx.showLoading({
      title: '翻阅猫谱中...',
      mask: true,
    })
    let catList = [];
    let catData = catRes.data
    const minProb = 0.001 
    const minNum = 3
    const maxNum = 5 // 展示多少只/概率？
    for (let index = 0; index < catData.length; index++) {
      // 最多五只，最少三只，去除概率太低的
      if (index < maxNum) {
        if (catData[index].prob > minProb || index < minNum) {
          let cat = catData[index]
          let catInfo = await this.loadCat(cat)
          catList.push(catInfo)
        } else {break;}
      }else{
        break;
      }
    }
    console.log("catList:", catList);
    this.setData({
      catList: catList
    })
    wx.hideLoading() // 查找猫猫信息结束
  },

  async loadCat(cat) {
    const that = this;
    let cat_id = cat.catID;
    let accuracy = cat.prob;
    let catInfo;
    const db = wx.cloud.database();
    await db.collection('cat').doc(cat_id).get().then(res => {
      console.log('cat info res:', res);

      // res.data.characteristics_string = [(res.data.colour || '') + '猫'].concat(res.data.characteristics || []).join('，');
      if (res.data.colour) {
        res.data.characteristics_string = (res.data.colour || '') + '猫';
      }

      res.data.accuracy = (accuracy * 100).toFixed(1);

      catInfo = res.data;
    });
    let photo = await this.loadPhoto(catInfo);
    catInfo.photo = photo;
    return catInfo;
  },

  async loadPhoto(cat) {
    const db = wx.cloud.database();
    const photo = db.collection('photo');

    const qf = {
      cat_id: cat._id,
      verified: true,
      best: true
    };
    var total = cat.photo_count;
    var index = randomInt(0, total);

    var pho_src = (await photo.where(qf).skip(index).limit(1).get()).data[0];
    console.log("load cat Photo:", pho_src);
    return pho_src;
  },

  choosePhoto() {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      // maxDuration: 30,
      // camera: 'back',
      success(res) {
        console.log("chooseMedia", res.tempFiles)
        that.setData({
          src: res.tempFiles[0].tempFilePath
        })
        that.uploadPhoto(res.tempFiles[0].tempFilePath)
      }
    })
  },

  back() {
    this.setData({
      src: '',
      catList: ''
    })
  },

  reverseCamera() {
    if (this.data.cameraAuth) {
      if (this.data.lensDirection === 'front') {
        this.setData({
          lensDirection: 'back'
        })
      } else {
        this.setData({
          lensDirection: 'front'
        })
      }
    } 

  },
  savePhoto() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.src,
      success(){
        wx.showToast({
          title: '保存成功',
          icon: 'success',
          duration: 8000
        })
      }
    })
  },

  clickCatCard(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    const detail_url = '/pages/genealogy/detailCat/detailCat';
    wx.navigateTo({
      url: detail_url + '?cat_id=' + cat_id,
    });
  },
})