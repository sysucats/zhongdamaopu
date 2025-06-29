import { text as text_cfg, cat_status_adopt } from "../../config";
import { checkAuth, fillUserInfo } from "../../utils/user";
import { loadFilter } from "../../utils/page";
import { getCatItemMulti } from "../../utils/cat";
import { signCosUrl } from "../../utils/common";
import api from "../../utils/cloudApi";
const app = getApp();

const photoStep = 5; // 每次加载的图片数量

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    cat_id: {
      type: String,
      value: '',
      observer: function (newVal, oldVal) {
        if (newVal && newVal !== oldVal) {
          if (!this.jsData) {
            this.jsData = { cat_id: newVal, phers: {} };
          } else {
            this.jsData.cat_id = newVal;
          }
          this.loadCat();
        }
      }
    },
    auth: {
      type: Boolean,
      value: false
    },
    isNewCat: {
      type: Boolean,
      value: false
    },
    selectedCat: {
      type: Object,
      value: null,
      observer: function (newVal) {
        if (newVal) {
          // 当外部传入 selectedCat 时自动加载
          this.loadCatData(newVal);
        }
      }
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    pickers: {
      gender: ['公', '母', '未知'],
      sterilized: ['未绝育', '已绝育'],
      missing: ['否', '是'],
      to_star: ['否', '是'],
      adopt: []
    },
    adopts: [], // 将存储adopt选项的映射
    pickerValueMaps: {
      sterilized: [false, true],
      missing: [false, true],
      to_star: [false, true]
    },
    picker_selected: {},
    bottomShow: false,
    text_cfg: text_cfg,
    only_best_photo: false,
    isNewMode: false
  },

  jsData: null,

  lifetimes: {
    attached: async function () {
      this.jsData = {
        cat_id: this.properties.cat_id || null,
        phers: {}
      };

      // 初始化adopts数据
      this.setData({
        adopts: cat_status_adopt.map((x) => { return { desc: x } })
      });

      // 设置pickers.adopt
      this.setData({
        'pickers.adopt': cat_status_adopt
      });
      await this.loadPickers();
      if (this.properties.cat_id) {
        this.jsData.cat_id = this.properties.cat_id;
        await this.loadCat();
      } else if (this.properties.isNewCat) {
        // 如果是新建猫咪模式，初始化数据
        this.setData({
          cat: {
            nickname: [],
            characteristics: [],
            popularity: 0,
          },
          isNewMode: true
        });
        // 触发模式变化事件
        this.triggerEvent('modeChange', { isNewCat: true });
      }
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 返回上一页
    goBack() {
      this.triggerEvent('back');
    },

    // 加载外部传入的猫咪数据
    loadCatData(cat) {
      if (!cat || !cat._id) return;

      // 确保 jsData 已初始化
      if (!this.jsData) {
        this.jsData = {
          cat_id: cat._id,
          phers: {}
        };
      } else {
        this.jsData.cat_id = cat._id;
      }
      console.log('[loadCatData] - 加载外部传入的猫咪数据:', cat);
      this.loadCat();
    },

    // 创建新猫
    createNewCat() {
      // 确保 jsData 已初始化
      if (!this.jsData) {
        this.jsData = { cat_id: undefined, phers: {} };
      }
      this.setData({
        cat: {
          nickname: [],
          characteristics: [],
          popularity: 0,
        },
        isNewMode: true
      });
      this.jsData.cat_id = undefined;
      // 触发模式变化事件
      this.triggerEvent('modeChange', { isNewCat: true });
    },

    async loadCat(catId) {
      // 如果传入了 catId 参数，优先使用它
      if (catId) {
        if (!this.jsData) {
          this.jsData = { cat_id: catId, phers: {} };
        } else {
          this.jsData.cat_id = catId;
        }
      }
      // 确保 jsData 已初始化
      if (!this.jsData) {
        this.jsData = { cat_id: null, phers: {} };
        console.log('[loadCat] - 初始化 jsData');
      }
      if (this.jsData.cat_id === undefined) {
        this.setData({
          cat: {
            nickname: [],
            characteristics: [],
            popularity: 0,
          }
        });
        //说明是新猫
        return false;
      }

      var cat = (await getCatItemMulti([this.jsData.cat_id], { nocache: true }))[0];
      console.log("[loadCat] -", cat);
      cat.mphoto = String(new Date(cat.mphoto));
      // 处理一下picker
      var picker_selected = {};
      const pickers = this.data.pickers;
      const pickerValueMaps = this.data.pickerValueMaps;
      for (const key in pickers) {
        const items = pickers[key];
        const value = cat[key];
        if (value == undefined) {
          continue;
        }
        // 处理使用映射表的情况
        if (pickerValueMaps && pickerValueMaps[key]) {
          // 在映射表中找到对应的索引
          const idx = pickerValueMaps[key].indexOf(value);
          if (idx !== -1) {
            picker_selected[key] = idx;
            continue;
          }
        }
        // 对于普通选项或者没找到映射值
        const idx = items.findIndex((v) => {
          if (typeof v === 'object' && v.desc !== undefined) {
            return v.desc === value;
          }
          return v === value;
        });
        if (idx === -1 && typeof value === "number") {
          // 既不是undefined，也找不到，说明存的就是下标
          picker_selected[key] = value;
        } else {
          picker_selected[key] = idx !== -1 ? idx : 0;
        }
      }
      await this.setData({
        cat: cat,
        picker_selected: picker_selected,
      });

      await this.reloadPhotos();
    },

    async reloadPhotos() {
      // 确保 jsData 已初始化
      if (!this.jsData) {
        this.jsData = { cat_id: null, phers: {} };
        return; // 如果没有 cat_id，无法加载照片
      }

      const only_best_photo = this.data.only_best_photo;
      const { result: photoRes } = await app.mpServerless.db.collection('photo').count({ cat_id: this.jsData.cat_id, verified: true, best: only_best_photo })
      this.setData({
        photoMax: photoRes,
        photo: []
      });
      await this.loadMorePhotos();
    },

    checkNeedLoad() {
      if (this.data.photoMax == 0 || this.data.photo.length >= this.data.photoMax) {
        this.setData({
          bottomShow: true,
          bottomText: "-- 没有更多猫图了 --",
          noMorePhoto: true,
        });
        console.log("[checkNeedLoad] - Check no more");
        return false;
      } else {
        this.setData({
          bottomShow: true,
          bottomText: '点击加载更多猫图',
        });
        return true;
      }
    },
    // 点击加载更多
    async clickLoad(e) {
      await this.loadMorePhotos();
    },

    async loadMorePhotos() {
      // 确保 jsData 已初始化
      if (!this.jsData) {
        this.jsData = { cat_id: null, phers: {} };
      }
      if (this.jsData.cat_id === undefined) {
        // 新猫，没有照片
        return false;
      }
      var cat = this.data.cat;
      var photo = this.data.photo;
      // 给这个参数是防止异步
      if (!this.checkNeedLoad(cat)) {
        return false;
      }

      const only_best_photo = this.data.only_best_photo;
      const qf = { cat_id: this.jsData.cat_id, verified: true, best: only_best_photo };
      const now = photo.length;
      var { result: newPhotos } = await app.mpServerless.db.collection('photo').find(qf, { sort: { mdate: -1 }, skip: now, limit: photoStep })
      await fillUserInfo(newPhotos, "_openid", "userInfo");

      console.log("[loadMorePhotos] -", newPhotos);
      for (var photos of newPhotos) {
        if (photos.photo_id) {
          photos.photo_id = await signCosUrl(photos.photo_id);
        }
        if (photos.photo_compressed) {
          photos.photo_compressed = await signCosUrl(photos.photo_compressed);
        }
        if (photos.photo_watermark) {
          photos.photo_watermark = await signCosUrl(photos.photo_watermark);
        }
      }
      photo = photo.concat(newPhotos);
      this.setData({
        photo: photo
      });
    },

    // 输入了东西
    inputText(e) {
      const key = e.currentTarget.dataset.key;
      const value = e.detail.value;
      this.setData({
        ['cat.' + key]: value
      });
    },
    // 选择了东西
    pickerChange(e) {
      const key = e.currentTarget.dataset.key;
      const index = parseInt(e.detail.value);
      // 根据映射表或直接使用选项值
      let value;
      if (this.data.pickerValueMaps && this.data.pickerValueMaps[key]) {
        // 使用映射表中的实际值
        value = this.data.pickerValueMaps[key][index];
        console.log(`使用映射值 ${key}[${index}] = ${value}`);
      } else if (key === 'adopt') {
        // 特殊处理adopt选项：使用索引作为值
        value = index;
        console.log(`设置adopt索引值: ${index}`);
      } else {
        // 没有映射表，直接使用选项值
        value = this.data.pickers[key][index];
        if (typeof value === "object" && value.desc !== undefined) {
          // 说明是一种映射关系，只保存下标
          value = parseInt(index);
        }
      }

      // 设置数据并记录选择的索引
      this.setData({
        ['cat.' + key]: value,
        ['picker_selected.' + key]: index
      });

      console.log(`选择了 ${key} = ${value}，索引 = ${index}`);
      return value;
    },

    // 选择了出生日期
    pickerDateChange(e) {
      const key = e.currentTarget.dataset.key;
      const value = e.detail.value;
      this.setData({
        ['cat.' + key]: value
      });
      return value;
    },
    pickerAreaColumnChange(e) {
      var pickers = this.data.pickers;

      const column = e.detail.column;
      const index = e.detail.value;

      if (column == 0) {  // 修改了校区列内容，区域列变为对应校区的区域
        var now_campus = pickers.campus_area[0][index];
        pickers.campus_area[1] = pickers.area_category[now_campus];
        this.setData({
          "pickers.campus_area": pickers.campus_area,
          "pickers.campus_index": [index, 0]
        });
      }
    },
    bindAreaChange(e) {    // 这个和columnChange的区别是要确认才触发
      var pickers = this.data.pickers;
      const indices = e.detail.value;
      this.setData({
        'cat.campus': pickers.campus_area[0][indices[0]],
        'cat.area': pickers.campus_area[1][indices[1]]
      });
    },
    async loadPickers() {
      var filterRes = await loadFilter();
      console.log(filterRes);
      // 把area按campus分类
      var area_category = {};
      for (const campus of filterRes.campuses) {
        area_category[campus] = [];
      }
      for (const area of filterRes.area) {
        area_category[area.campus].push(area.name);
      }
      var first_campus = filterRes.campuses[0];
      this.setData({
        "pickers.area_category": area_category, // wxml实际上不用到这个值，但是更改area picker时的逻辑需要这些数据
        "pickers.campus_area": [filterRes.campuses, area_category[first_campus]],
        "pickers.campus_index": [0, 0],
        "pickers.colour": filterRes.colour,
      });
    },
    // 提交表单
    async saveCat() {
      if (!this.jsData) {
        this.jsData = { cat_id: null, phers: {} };
      }
      // 原upload方法的内容
      // 检查必要字段
      if (!this.data.cat.name) {
        wx.showToast({
          title: '缺少名字',
          icon: 'error'
        });
        return false;
      }
      if (!this.data.cat.campus || !this.data.cat.area) {
        wx.showToast({
          title: '缺少校区及区域',
          icon: 'error'
        });
        return false;
      }

      wx.showLoading({
        title: '更新中...',
      });
      var res = await api.updateCat({
        cat: this.data.cat,
        cat_id: this.jsData.cat_id
      });
      console.log("updateCat res:", res);
      if (res.insertedId) {
        this.jsData.cat_id = res.insertedId;
      }
      wx.showToast({
        title: '操作成功',
      });
      // 刷新缓存
      await getCatItemMulti([this.jsData.cat_id], { nocache: true });

      // 触发事件，根据是新建还是更新触发不同事件
      if (this.data.isNewMode) {
        this.triggerEvent('catCreated', { catId: this.jsData.cat_id, cat: this.data.cat });
        this.setData({ isNewMode: false });
      } else {
        this.triggerEvent('catUpdated', { catId: this.jsData.cat_id, cat: this.data.cat });
      }
    },
    async deletePhoto(e) {
      console.log("[deletePhoto] -", e);
      const photo = e.currentTarget.dataset.photo;
      const ActionRes = await wx.showActionSheet({
        itemList: ['删除照片', '移动到其他猫猫']
      });

      // 删除
      if (ActionRes.tapIndex === 0) {
        await this.doDelectPhoto(photo);
        return;
      }

      // 移动照片
      if (ActionRes.tapIndex === 1) {
        await this.showMovePhoto(photo);
        return;
      }
    },

    async doDelectPhoto(photo) {
      const modalRes = await wx.showModal({
        title: '提示',
        content: '确定删除？',
      });

      if (!modalRes.confirm) {
        return;
      }

      console.log('开始删除');
      await api.managePhoto({
        type: "delete",
        photo: photo
      });

      console.log("删除照片记录：" + photo._id);
      wx.showToast({
        title: '删除成功',
      });
      await this.reloadPhotos();
    },

    // 设置 / 取消 照片精选
    async reverseBest(e) {
      const photo = e.currentTarget.dataset.photo;
      const index = e.currentTarget.dataset.index;
      const set_best = !photo.best;
      await api.managePhoto({
        type: "setBest",
        photo: photo,
        best: set_best
      });

      await wx.showModal({
        title: '完成',
        content: '设置成功',
        showCancel: false,
      });

      this.setData({
        ['photo[' + index + '].best']: set_best
      });
    },
    inputPher(e) {
      if (!this.jsData) {
        this.jsData = { cat_id: null, phers: {} };
      }
      const input = e.detail.value;
      const pid = e.currentTarget.dataset.pid;
      this.jsData.phers[pid] = input;
    },
    async updatePher(e) {
      if (!this.jsData) {
        this.jsData = { cat_id: null, phers: {} };
      }
      const photo = e.currentTarget.dataset.photo;
      const index = e.currentTarget.dataset.index;
      const pid = photo._id;
      const photographer = this.jsData.phers[pid];
      await api.managePhoto({
        type: "setPher",
        photo: photo,
        photographer: photographer
      });
      await wx.showModal({
        title: '完成',
        content: '设置成功',
        showCancel: false,
      });

      this.setData({
        ['photo[' + index + '].photographer']: photographer
      });
    },
    async switchOnlyBest() {
      const only_best_photo = this.data.only_best_photo;
      this.setData({
        only_best_photo: !only_best_photo
      });
      await this.reloadPhotos();
    },

    // 移动照片时的猫猫搜索
    async showMovePhoto(photo) {
      this.setData({
        showSelectCat: true,
        movePhoto: photo,
      });
    },

    // 选择移动到的猫
    async selectMoveCat(e) {
      const cat = e.detail,
        photo = this.data.movePhoto;
      if (!cat || !photo) {
        return;
      }

      await api.curdOp({
        operation: "update",
        collection: "photo",
        item_id: photo._id,
        data: { cat_id: cat._id },
      });

      wx.showToast({
        title: '移动完成',
      });

      this.setData({
        showSelectCat: false
      });
      await this.reloadPhotos();
    },

    async upload() {
      await this.saveCat();
    }
  }
})


