import {
  getCatItemMulti
} from "../../cat.js";
import {
  likeCheck,
  likeAdd
} from "../../inter.js";
import {getDateWithDiffHours, formatDate} from "../../utils.js";

Page({
  //不需要渲染到wxml的数据存储在jsData中
  jsData: {
    columnsHeight: [0, 0],
    isLoading: false,
    like_mutex: false,
    canReverse: false,
  },
  data: {
    columns: [
      [],
      []
    ],
    tempPics: [],
    loadnomore: false,
  },
  //获取图片尺寸数据
  loadPic: function (e) {
    var that = this,
      data = that.data,
      tempPics = data.tempPics,
      index = e.currentTarget.dataset.index
    if (tempPics[index]) {
      //以750为宽度算出相对应的高度
      tempPics[index].height = e.detail.height * 750 / e.detail.width
      tempPics[index].isLoad = true
    }
    that.setData({
      tempPics: tempPics
    }, function () {
      that.finLoadPic()
    })
  },
  //图片加载错误处理
  loadPicError: function (e) {
    var that = this,
      data = that.data,
      tempPics = data.tempPics,
      index = e.currentTarget.dataset.index
    if (tempPics[index]) {
      //图片加载错误时高度固定750，展示为正方形
      tempPics[index].height = 750
      tempPics[index].isLoad = true
    }
    that.setData({
      tempPics: tempPics
    }, function () {
      that.finLoadPic()
    })
  },
  //判断图片是否加载完成
  finLoadPic: function () {
    var that = this,
      data = that.data,
      tempPics = data.tempPics,
      length = tempPics.length,
      fin = true
    for (var i = 0; i < length; i++) {
      if (!tempPics[i].isLoad) {
        fin = false
        break
      }
    }
    if (fin) {
      if (that.jsData.isLoading) {
        that.jsData.isLoading = false
        that.renderPage()
      }
    }
  },
  //渲染到瀑布流
  renderPage: function () {
    var that = this,
      data = that.data,
      columns = data.columns,
      tempPics = data.tempPics,
      length = tempPics.length,
      columnsHeight = that.jsData.columnsHeight,
      index = 0
    for (var i = 0; i < length; i++) {
      index = columnsHeight[1] < columnsHeight[0] ? 1 : 0
      columns[index].push(tempPics[i])
      columnsHeight[index] += tempPics[i].height
    }
    that.setData({
      columns: columns,
      tempPics: []
    })
    that.jsData.columnsHeight = columnsHeight
  },
  //加载数据
  loadData: async function () {
    if (this.jsData.isLoading || this.data.loadnomore) {
      return;
    }
    this.jsData.isLoading = true

    const db = wx.cloud.database();
    const _ = db.command;
    const curCount = this.data.columns[0].length + this.data.columns[1].length;
    const oneMonth = getDateWithDiffHours(-24*31);
    console.log(oneMonth);
    var photos = (await db.collection('photo').where({
      mdate: _.gte(oneMonth),
      like_count: _.gte(1),
    }).orderBy('like_count', 'desc').skip(curCount).limit(5).get()).data;

    // 浏览过程中点赞，会导致序变化，但目前只会加点赞，因此只需要去重
    photos = this.removeDupPhoto(photos);

    if (!photos.length) {
      this.jsData.isLoading = false;
      this.setData({
        loadnomore: true
      });
      return;
    }

    // 网络请求
    var [cat_res, like_res] = await Promise.all([
      getCatItemMulti(photos.map(p => p.cat_id)),
      likeCheck(photos.map(p => p._id))
    ]);
    for (let i = 0; i < photos.length; i++) {
      var p = photos[i];
      p.pic = p.photo_compressed || p.photo_id;
      p.pic_prev = p.photo_watermark || p.photo_id;
      p.cat = cat_res[i];
      p.liked = like_res[i];
      p.mdate_str = formatDate(p.mdate, "yyyy/MM/dd")
    }
    console.log(photos);
    this.setData({
      tempPics: photos
    });
  },
  removeDupPhoto: function (photos) {
    var m = {};
    for (const col of this.data.columns) {
      for (const p of col) {
        m[p._id] = true
      }
    }
    return photos.filter(p => !m[p._id]);
  },
  onLoad: function () {
    this.loadData()
  },
  onReachBottom: function () {
    this.loadData()
  },
  clickLike: async function clickLike(e) {
    if (this.jsData.like_mutex) {
      return false;
    }
    this.jsData.like_mutex = true;

    var liked = !this.data.liked;
    // 不能取消赞
    if (!liked && !this.jsData.canReverse) {
      return;
    }

    const {
      col,
      i
    } = e.currentTarget.dataset;
    var photo = this.data.columns[col][i];
    var like_count = photo.like_count || 0;
    like_count = liked ? like_count + 1 : like_count - 1;
    this.setData({
      [`columns[${col}][${i}].liked`]: liked,
      [`columns[${col}][${i}].like_count`]: like_count,
    });

    // 执行数据库写入
    if (liked) {
      await likeAdd(photo._id, "photo");
    } else {
      // todo
    }
    this.jsData.like_mutex = false;
  },
  // 点击猫猫名称
  clickCatName(e) {
    const detail_url = '/pages/genealogy/detailCat/detailCat';
    const {cat_id} = e.currentTarget.dataset;
    wx.navigateTo({
      url: detail_url + '?cat_id=' + cat_id,
    });
  },
  // 点击照片
  clickPhoto(e) {
    const {url} = e.currentTarget.dataset;
    wx.previewImage({
      urls: [url],
    });
  }
})