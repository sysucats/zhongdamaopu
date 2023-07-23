// components/searchCat/searchCat.js
import { getAvatar } from "../../utils/cat";
import { regReplace } from "../../utils/utils";
import { cloud } from "../../utils/cloudAccess";

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    show: {
      type: Boolean,
      value: false,
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    focusSearch: false,
    // 与页面无关的数据
    jsData: {
      loading: false,
    },
  },


  /**
   * 组件的方法列表
   */
  methods: {
    // 搜索猫猫
    fSearchInput(e) {
      var value = e.detail.value;
      this.setData({
        filters_input: value
      })
    },
  
    async doSearchCat() {
      const db = await cloud.databaseAsync();
      const _ = db.command;
      if (!this.data.filters_input || this.data.jsData.loading) {
        return false;
      }
      wx.showLoading({
        title: '搜索中...',
      })
      this.data.jsData.loading = true;
      var filters = [];
      const filters_input = regReplace(this.data.filters_input);
      if (filters_input.length) {
        var search_str = [];
        for (const n of filters_input.trim().split(' ')) {
          search_str.push(`(.*${n}.*)`);
        }
        let regexp = db.RegExp({
          regexp: search_str.join("|"),
          options: 'is',
        });
        filters.push(_.or([{
          name: regexp
        }, {
          nickname: regexp
        }]));
      }
      
      // 准备搜索
      var query = filters.length ? _.and(filters) : {};
      var cats = (await db.collection('cat').where(query).get()).data;
      // 获取头像
      for (var cat of cats) {
        cat.avatar = await getAvatar(cat._id, cat.photo_count_best);
      }
      this.setData({
        searchCats: cats,
      });
      wx.hideLoading();
      this.data.jsData.loading = false;
    },
    // 选择猫猫
    async searchSelectCat(e) {
      var idx = e.currentTarget.dataset.index;
      var cat = this.data.searchCats[idx];
      this.triggerEvent("select", cat);
    },

    // 隐藏
    hide() {
      this.setData({
        show: false,
      })
    }
  }
})
