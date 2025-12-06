// components/searchCat/searchCat.js
import { getAvatar } from "../../utils/cat";
import { regReplace } from "../../utils/utils";
import config from "../../config";
const app = getApp();

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    show: {
      type: Boolean,
      value: false,
    },
    disabledIds: {
      type: Array,
      value: [],
    },
    selfId: {
      type: String,
      value: ''
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    focusSearch: false,

    text_cfg: config.text,

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
        // EMAS Serverless 查询方式
        filters.push({
          $or: [ // 使用 $or
            { name: { $regex: search_str.join("|") } },
            { nickname: { $regex: search_str.join("|") } }
          ]
        });
      }

      // 准备搜索
      var query = filters.length ? {"$and" : (filters)} : {};
      const { result: cats } = await app.mpServerless.db.collection('cat').find(query);
      // 批量获取头像
      const ids = cats.map(cat => cat._id);
      const avatars = await getAvatar(ids);
      for (let i = 0; i < cats.length; i++) {
        cats[i].avatar = avatars[i];
        // 标记禁选（已添加）与自己
        cats[i]._disabled = Array.isArray(this.properties.disabledIds) && this.properties.disabledIds.includes(cats[i]._id);
        cats[i]._isSelf = !!this.properties.selfId && (cats[i]._id === this.properties.selfId);
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
      if (cat && cat._disabled) {
        // 已存在关系，不可选择
        return;
      }
      if (cat && cat._isSelf) {
        wx.showToast({ title: '不能选择自己', icon: 'none' });
        return;
      }
      this.triggerEvent("select", cat);
    },

    // 隐藏
    hide() {
      this.setData({
        show: false,
        searchCats: [],
        filters_input: ''
      })
    }
  }
})
