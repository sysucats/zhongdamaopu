// miniprogram/pages/genealogy/genealogy.js

// const default_png = '../../images/default.png';
const default_png = undefined;
import { regeneratorRuntime, randomInt, isWifi, isManager, shuffle } from '../../utils.js';
const catsStep = 6;

var loadingLock = 0;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    cats: [],

    filters: [
      // ['全部校区', '东校区', '南校区', '北校区', '珠海校区', '深圳校区'],
      // ['全部花色', '橘', '白', '白橘', '三花', '黑', '灰', '玳瑁'],
      // ['全部特点', '胖', '白手套', '白围脖', '橘尾巴'],
    ],
    filters_pickers: {},
    filters_pickers_act: [0, 0],
    // 对应数据库的key
    filter_keys: ['campus', 'colour'],
    filter_keys_name: {
      'campus': '校区',
      'colour': '花色'
    },

    // 这个就有点难理解了，它每一位是二进制表示，对应上面一组filter的激活状态。
    // filter_active: [1, 1, 1],
    
    // 高度，单位为px
    heights: {
      filters: 40,
    },
    // 总共有多少只猫
    catsMax: 0,

    // 加载相关
    loading: false, // 正在加载
    loadnomore: false, // 没有再多了
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 下面开始加载filters
    const db = wx.cloud.database();
    db.collection('filter').limit(1).get().then(res => {
      console.log(res);
      var filters = [];
      for (const k of this.data.filter_keys) {
        res.data[0][k].unshift('全部' + this.data.filter_keys_name[k]);
        filters.push(res.data[0][k]);
      }
      this.setData({
        filters: filters,
        filters_pickers: res.data[0],
      }, () => { this.reloadCats(); });
    });
    // 下面开始加载wifi信息
    isWifi(function(res) {
      // 不是wifi时提醒一下
      if(!res) {
        // 暂时移除
        // wx.showModal({
        //   title: '注意流量消耗',
        //   content: '非Wifi网络看猫图要注意流量消耗哈',
        //   showCancel: false,
        // });
      }
    });
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {
    this.getHeights();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    this.loadMoreCats();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  },

  checkNeedLoad() {
    if (this.data.cats.length >= this.data.catsMax) {
      this.setData({
        loadnomore: true
      });
      return false;
    }
    return true;
  },

  reloadCats() {
    // 增加lock
    loadingLock ++;
    const nowLoadingLock = loadingLock;
    const db = wx.cloud.database();
    const cat = db.collection('cat');
    const query = this.getPickerQueryFilters();
    console.log(query);
    cat.where(query).count().then(res => {
      if (loadingLock != nowLoadingLock) {
        // 说明过期了
        return false;
      }
      this.setData({
        cats: [],
        catsMax: res.total,
        loadnomore: false,
      }, function () {
        this.loadMoreCats();
      });
    });
  },
  
  // 加载更多的猫猫
  loadMoreCats() {
    // 加载lock
    const nowLoadingLock = loadingLock;
    if (!this.checkNeedLoad() || this.data.loading) {
      return false;
    }
    const that = this;
    this.setData({
      loading: true
    }, () => {
      var cats = that.data.cats;
      var step = catsStep;
      const db = wx.cloud.database();
      const cat = db.collection('cat');
      const _ = db.command;
      const query = that.getPickerQueryFilters();
      console.log("query condition: " + JSON.stringify(query));
      cat.where(query).orderBy('mphoto', 'desc').orderBy('popularity', 'desc').skip(cats.length).limit(step).get().then(res => {
        if (loadingLock != nowLoadingLock) {
          // 说明过期了
          return false;
        }
        console.log(res.data);
        res.data = shuffle(res.data);
        for (var d of res.data) {
          d.photo = default_png;
          d.characteristics_string = [(d.colour || '') + '猫'].concat(d.characteristics || []).join('，');
          if (!d.mphoto) {
            d.mphoto_new = false;
          } else {
            const today = new Date();
            const delta_date = today - (new Date(d.mphoto)); // milliseconds
            // 小于7天
            d.mphoto_new = ((delta_date / 1000 / 3600 / 24) < 7);
          }
        }
        const new_cats = cats.concat(res.data);
        that.setData({
          cats: new_cats,
          loading: false,
          loadnomore: Boolean(new_cats.length === that.data.catsMax )
        }, () => {
          that.loadCatsPhoto().then();
        });
      });
    });
  },

  async loadCatsPhoto() {
    // 加载lock
    const nowLoadingLock = loadingLock;

    const cats = this.data.cats;
    const db = wx.cloud.database();
    const photo = db.collection('photo');

    var cat2photos = {};
    for (var cat of cats) {
      if (cat.photo === default_png) {
        const qf = { cat_id: cat._id, verified: true, best: true };
        var total = cat.photo_count;
        // var total = (await photo.where(qf).count()).total;
        if (!total || total === 0) {
          // 说明这只猫还没有照片
          continue;
        }

        // 这里对于API调用的次数较多，需要修改
        var index = randomInt(0, total);
        var pho_src = (await photo.where(qf).skip(index).limit(1).get()).data;
        cat2photos[cat._id] = pho_src[0];
        // cat.photo = pho_src[0];
      }
    }

    if (loadingLock != nowLoadingLock) {
      console.log("过期了，照片数量：" + cats.length);
      // 说明过期了
      return false;
    }

    // 这里重新获取一遍，因为可能已经刷新了
    var new_cats = this.data.cats;
    for (var c of new_cats) {
      if (cat2photos[c._id]) {
        c.photo = cat2photos[c._id];
      }
    }

    this.setData({
      cats: new_cats
    });

  },
  
  // 点击猫猫卡片
  clickCatCard(e) {
    console.log(e);
    const cat_id = e.currentTarget.dataset.cat_id;
    const detail_url = '/pages/detailCat/detailCat';
    wx.navigateTo({
      url: detail_url + '?cat_id=' + cat_id,
    });
  },

  // 选择筛选框
  picker_change(e) {
    console.log(e);
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    this.setData({
      ['filters_pickers_act[' + key + ']']: parseInt(value)
    }, () => {
      this.reloadCats();
    });
  },
  // 计算数据库要用的filter，单选情况
  getPickerQueryFilters() {
    const filters = this.data.filters_pickers;
    const active = this.data.filters_pickers_act;
    const filter_keys = this.data.filter_keys;
    var res = {};
    for (const i in filter_keys) {
      // 这里是选择全部校区
      if (active[i] === 0) {
        continue;
      }

      const key = filter_keys[i];
      // 这里是选择XX校区
      if (filters[key][active[i]].includes('校区')) {
        // 取出前两个字：东校、南校、珠海、深圳、北校
        const prefix = filters[key][active[i]].substr(0, 2);
        const _ = wx.cloud.database().command;
        var selected = [];
        for (const str of filters[key]) {
          if (str.includes(prefix)) {
            selected.push(str);
          }
        }
        res[key] = _.in(selected);
      } else {
        res[key] = filters[key][active[i]];
      }
    }
    return res;
  },
  // 开始计算各个东西高度
  getHeights() {
    wx.getSystemInfo({
      success: res => {
        console.log(res);
        this.setData({
          "heights.screenHeight": res.screenHeight,
          "heights.windowHeight": res.windowHeight,
          "heights.statusBarHeight": res.statusBarHeight,
          "heights.rpx2px": res.windowWidth / 750,
        });
      }
    });
  },
  // 管理员判断，其实可以存到global里
  bindManageCat(e) {
    const that = this;
    isManager(res => {
      if (res) {
        const cat_id = e.currentTarget.dataset.cat_id;
        wx.navigateTo({
          url: '/pages/addCat/addCat?cat_id=' + cat_id,
        });
      } else {
        console.log("not a manager");
      }
    })
  },
})