import { checkAuth } from "../../../utils/user";
import { getAvatar, getCatItem } from "../../../utils/cat";
import config from "../../../config";
const app = getApp();
Page({
  /**
   * 页面的初始数据
   */
  data: {
    auth: false,
    activeTab: 'relation', // 默认激活关系选项卡
    selectedCat: null, // 当前选中的猫咪
    showSearchResults: false, // 是否显示搜索结果
    searchKeyword: '', // 搜索关键词
    searchResults: [], // 搜索结果列表
    showVaccineOptions: false, // 控制疫苗选项的显示/隐藏
    catInfoTab: null, // 信息编辑组件实例
    isNewMode: false, // 新增模式标志
    hasShownInfoModal: false, // 是否已显示过添加猫咪的提示框

    text_cfg: config.text, // 文本配置
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    // 检查用户权限
    if (await checkAuth(this, 2)) {
      this.setData({
        auth: true,
        catInfoTab: this.selectComponent('#catInfoTab')
      });

      // 加载对应猫
      if (options.cat_id) {
        this.getCatById(options.cat_id);
      }

      // 切换到对应选项卡
      if (options.activeTab) {
        this.setData({ activeTab: options.activeTab });
      }
    }
  },

  /**
   * 切换选项卡
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      activeTab: tab,
      showVaccineOptions: false,
      catInfoTab: this.selectComponent('#catInfoTab')
    });

    if (tab === 'info' && this.data.selectedCat) {
      setTimeout(() => {
        const catInfoTab = this.selectComponent('#catInfoTab');
        if (catInfoTab) {
          console.log('刷新猫咪信息组件');
          catInfoTab.loadCatData(this.data.selectedCat);
        }
      }, 300);
    }

    // 如果切换到信息但没有选中猫，引导用户创建新猫
    if (tab === 'info' && !this.data.selectedCat && !this.data.hasShownInfoModal) {
      const infoTab = this.selectComponent('#catInfoTab');
      if (infoTab) {
        wx.showModal({
          title: '提示',
          content: '是否要添加新猫？',
          confirmText: '添加新猫',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              infoTab.createNewCat();
              // 更新新建模式状态
              this.setData({
                isNewMode: true
              });
            }
            // 无论用户是否确认，都标记为已显示过弹窗
            this.setData({
              hasShownInfoModal: true
            });
          }
        });
      } else {
        // 没有找到组件实例也标记为已显示过弹窗，避免重复弹出
        this.setData({
          hasShownInfoModal: true
        });
      }
    }
  },

  /**
   * 搜索输入事件
   */
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
    // 清除输入框时隐藏搜索结果
    if (!e.detail.value.trim()) {
      this.setData({
        showSearchResults: false
      });
    }
  },

  /**
   * 搜索猫咪
   */
  async searchCat() {
    const keyword = this.data.searchKeyword.trim();
    if (!keyword) {
      return;
    }

    try {
      wx.showLoading({ title: '搜索中...' });
      // 搜索名称或昵称
      const { result } = await app.mpServerless.db.collection('cat').find({
        $or: [
          { name: { $regex: keyword} },
          { nickname: { $regex: keyword} },
        ]
      }, { limit: 10 });

      // 加载头像
      const cats = [];
      for (const cat of result) {
        cat.avatar = await getAvatar(cat._id, cat.photo_count_best);
        cats.push(cat);
      }

      this.setData({
        searchResults: cats,
        showSearchResults: true
      });

      wx.hideLoading();
    } catch (error) {
      console.error("搜索猫咪失败:", error);
      wx.hideLoading();
      wx.showToast({
        title: '搜索失败',
        icon: 'none'
      });
    }
  },

  /**
   * 选择搜索结果
   */
  selectCat(e) {
    const catId = e.currentTarget.dataset.id;
    console.log('选中猫咪ID:', catId);
    this.getCatById(catId);
    this.setData({
      showSearchResults: false,
      searchKeyword: '',
      hasShownInfoModal: false // 重置弹窗标志，以便下次未选猫时能够再次弹出
    });
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 如果有选中的猫咪，刷新数据
    if (this.data.selectedCat) {
      this.getCatById(this.data.selectedCat._id);
    }
  },

  /**
   * 通过ID获取猫咪信息
   */
  async getCatById(catId) {
    if (!catId) return;

    try {
      wx.showLoading({ title: '加载中...' });
      console.log('正在获取猫咪信息, ID:', catId);

      // 获取猫咪基本信息和头像
      const cat = await getCatItem(catId);
      cat.avatar = await getAvatar(cat._id, cat.photo_count_best);

      console.log('获取到猫咪信息:', cat);

      this.setData({
        selectedCat: cat,
        isNewMode: false // 重置新建模式
      });

      console.log('selectedCat已更新:', this.data.selectedCat);

      // 确保catInfoTab加载最新的猫咪信息
      setTimeout(() => {
        const catInfoTab = this.selectComponent('#catInfoTab');
        if (catInfoTab && this.data.activeTab === 'info') {
          console.log('调用catInfoTab.loadCat，catId:', catId);
          try {
            // 先初始化必要属性
            catInfoTab.setData({
              selectedCat: cat
            });
            // 调用loadCat
            catInfoTab.loadCat(catId);
          } catch (error) {
            console.error('调用catInfoTab.loadCat出错:', error);
          }
        }
      }, 300);
      wx.hideLoading();
    } catch (error) {
      console.error("加载猫咪信息失败:", error);
      wx.hideLoading();
      wx.showToast({
        title: '加载猫咪信息失败',
        icon: 'none'
      });
    }
  },

  // 跳转到猫猫主页
  navigateToCat(e) {
    const cat = e.currentTarget.dataset.cat;
    wx.navigateTo({
      url: `/pages/genealogy/detailCat/detailCat?cat_id=${cat._id}`
    });
  },

  // 添加记录
  handleAddRecord() {
    if (!this.data.selectedCat) {
      return;
    }

    // 关系选项卡直接添加关系
    if (this.data.activeTab === 'relation') {
      const relationTab = this.selectComponent('#relationTab');
      if (relationTab) {
        relationTab.addRelation();
      }
    }
  },

  // 疫苗类型管理按钮
  handleVaccineTypeManager() {
    const vaccineTab = this.selectComponent('#vaccineTab');
    vaccineTab.showVaccineTypeManager();
    this.setData({
      showVaccineOptions: false
    });
  },

  // 添加疫苗按钮
  handleAddVaccine() {
    const vaccineTab = this.selectComponent('#vaccineTab');
    vaccineTab.addVaccine();
    this.setData({
      showVaccineOptions: false
    });
  },
  // 查看已接种疫苗的猫
  handleViewVaccinatedCats() {
    const vaccineTab = this.selectComponent('#vaccineTab');
    vaccineTab.showVaccinatedCats();
    this.setData({
      showVaccineOptions: false
    });
  },

  // 在疫苗组件中选择猫猫
  onVaccineTabSelectCat(e) {
    const { catId } = e.detail;
    if (catId) {
      this.getCatById(catId);
    }
  },

  // 切换疫苗选项的显示/隐藏
  toggleVaccineOptions() {
    this.setData({
      showVaccineOptions: !this.data.showVaccineOptions
    });
  },

  // 新建猫咪
  handleCreateNewCat() {
    // 先设置新建模式状态
    this.setData({
      isNewMode: true
    });
    const infoTab = this.selectComponent('#catInfoTab');
    if (infoTab) {
      infoTab.createNewCat();
      this.setData({
        catInfoTab: infoTab
      });
    } else {
      console.log('未找到catInfoTab组件，请确保在信息选项卡已激活');
    }
    // 如果当前不在信息选项卡，则切换到信息选项卡
    if (this.data.activeTab !== 'info') {
      this.setData({ activeTab: 'info' });
    }
  },

  // 保存猫咪信息
  handleSaveCat() {
    const infoTab = this.selectComponent('#catInfoTab');
    if (infoTab) {
      infoTab.saveCat();
    }
  },

  // 创建新猫成功
  onCatCreated(e) {
    const catId = e.detail.catId;
    if (catId) {
      this.getCatById(catId);
      wx.showToast({
        title: '创建成功',
        icon: 'success'
      });
    }
  },

  // 更新信息
  onCatUpdated(e) {
    const catId = e.detail.catId;
    if (catId && this.data.selectedCat) {
      this.getCatById(catId);
      wx.showToast({
        title: '更新成功',
        icon: 'success'
      });
    }
  },

  // 信息选项卡模式变化
  onInfoTabModeChange(e) {
    const isNewCat = e.detail.isNewCat;
    this.setData({
      isNewMode: isNewCat
    });
  },

  // 按钮
  handleActionButtonClick() {
    const { activeTab } = this.data;
    if (activeTab === 'vaccine') {
      this.toggleVaccineOptions();
    } else if (activeTab === 'relation') {
      this.handleAddRecord();
    } else if (activeTab === 'info') {
      if (this.data.selectedCat || this.data.isNewMode) {
        this.handleSaveCat();
      } else {
        this.handleCreateNewCat();
      }
    }
  },
}) 