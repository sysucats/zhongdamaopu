import {
  getCatItemMulti
} from "../../cat.js";
import { fillUserInfo } from "../../user";
import {
  likeCheck,
  likeAdd
} from "../../inter.js";
import {getDateWithDiffHours, formatDate} from "../../utils.js";
import config from "../../config";
import { showTab } from "../../page";
import { cloud } from "../../cloudAccess";

const share_text = config.text.app_name + ' - ' + config.text.genealogy.share_tip;

Page({
  //不需要渲染到wxml的数据存储在jsData中
  jsData: {
    columnsHeight: [0, 0],
    isLoading: false,
    like_mutex: false,
    canReverse: false,
    text_cfg: config.text
  },
  data: {
    columns: [
      [],
      []
    ],
    tempPics: [],
    loadnomore: false,
    filters: [{
      name: "周精选",
      hours: 24*7,
    }, {
      name: "月精选",
      hours: 24*31,
      active: true,
    }, {
      name: "年精选",
      hours: 24*365
    }, {
      name: "总精选",
      hours: 24*365*30
    },]
  },
  onShow: function () {
    // 切换自定义tab
    showTab(this);
  },
  onShareAppMessage: function () {
    return {
      title: share_text,
    };
  },
  onShareTimeline: function () {
    return this.onShareAppMessage();
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
    var data = this.data,
      columns = data.columns,
      columnsHeight = this.jsData.columnsHeight;
    for (const pic of data.tempPics) {
      var index = columnsHeight[0] <= columnsHeight[1] ? 0 : 1;
      columns[index].push(pic)
      columnsHeight[index] += pic.height
    }
    this.setData({
      columns: columns,
      tempPics: [],
      loadnomore: true
    })
    this.jsData.columnsHeight = columnsHeight
  },
  // 获取激活的时间范围
  getTimeRange: function () {
    for (const f of this.data.filters) {
      if (!f.active) {
        continue;
      }
      return f.hours;
    }
    // 兜底
    return 24*356;
  },
  // 加载数据
  loadData: async function () {
    if (this.jsData.isLoading) {
      return;
    }
    this.jsData.isLoading = true
    this.setData({
      loadnomore: false
    });

    const db = await cloud.databaseAsync();
    const _ = db.command;
    const curCount = this.data.columns[0].length + this.data.columns[1].length;
    const timeRange = this.getTimeRange();
    const oneMonth = getDateWithDiffHours(-timeRange);
    var photos = (await db.collection('photo').where({
      mdate: _.or([_.gte(oneMonth), _.gte(oneMonth.toISOString())]),
      like_count: _.gte(1),
    }).orderBy('like_count', 'desc').skip(curCount).limit(7).get()).data;
    
    await fillUserInfo(photos, "_openid", "userInfo");


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
      p.simplify_date = formatDate(p.mdate, "MM/dd")
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
      console.log("like lock");
      return false;
    }
    this.jsData.like_mutex = true;

    const {
      col,
      i
    } = e.currentTarget.dataset;
    var photo = this.data.columns[col][i];
    var liked = !photo.liked;
    // 不能取消赞
    if (!liked && !this.jsData.canReverse) {
      this.jsData.like_mutex = false;
      return;
    }

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
  },
  // 点击时间筛选
  fClickTime(e) {
    var {index} = e.currentTarget.dataset;
    const filters = this.data.filters;
    if (this.jsData.isLoading || filters[index].active) {
      return;
    }

    for (let i = 0; i < filters.length; i++) {
      if (!filters[i].active) {
        continue;
      }

      this.setData({
        [`filters[${i}].active`]: false,
        [`filters[${index}].active`]: true,
      });
      break;
    }

    this.reloadData();
  },
  async reloadData() {
    await this.setData({
      columns: [[], []],
      loadnomore: false
    })
    this.jsData.columnsHeight = [0, 0];
    await this.loadData();
  },
})