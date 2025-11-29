import { checkAuth, getUser } from "../../../utils/user"
import { getAvatar } from "../../../utils/cat";
import config from "../../../config";
import api from "../../../utils/cloudApi";

const app = getApp();
const DbHelper = require('../../../utils/dbHelper.js');

Page({
  data: {
    auth: false,
    loading: false,
    text_cfg: config.text,
    
    // 统计信息
    stats: {
      totalCats: 0,
      totalPhotos: 0,
      currentUserPhotos: 0,
      bestCount: 0
    },
    
    // 分页相关
    pageSize: 20,
    pageNum: 1,
    hasMore: true,
    loadingMore: false,
    
    // 猫猫列表
    cats: [],
    filteredCats: [],
    selectedCat: null,
    
    // 位置筛选
    campuses: [],
    filterCampus: 'all',
    
    // 搜索功能
    searchKeyword: '',
    
    // 照片和上传者数据
    uploaders: [],
    selectedUploader: null,
    photos: [],
    currentCatPhotos: [],
    
    // 筛选状态
    currentLevel: 'cats',
    filterBest: false,
    filterUploader: 'all',
    
    // 管理功能
    selectedPhotos: [],
    editMode: false,
    
    // 确认弹窗状态
    showDeleteConfirm: false,
    showSetBestConfirm: false,
    showCancelBestConfirm: false,

    // 当前用户信息
    currentUser: null
  },

  async onLoad(options) {
    if (await checkAuth(this, 2)) {
      this.setData({ auth: true });
 
      // 获取当前用户信息
      this.setData({ 
        currentUser: await getUser({
          nocache: true, 
        })
      });

      // 加载总的统计数据
      this.loadTotalStats();

      // 如果有传递cat_id，直接加载该猫猫的数据
      if (options.cat_id) {
        this.setData({ loading: true });
        await this.loadCats();
        const cat = this.data.cats.find(c => c._id === options.cat_id);
        if (cat) {
          await this.selectCatDirect(cat);
        }
        this.setData({ loading: false });
      } else {
        // 没有cat_id，只加载猫猫列表和用户照片统计
        this.loadCats();
        this.loadCurrentUserPhotosCount();
      }
    }
  },

  onPullDownRefresh() {
    if (this.data.currentLevel === 'cats') {
      Promise.all([
        this.loadCats(true),
        this.loadCurrentUserPhotosCount(),
        this.loadTotalStats()
      ]).then(() => {
        wx.stopPullDownRefresh();
        wx.showToast({
          title: '刷新成功',
          icon: 'success'
        });
      });
    } else if (this.data.currentLevel === 'photos' && this.data.selectedCat) {
      this.reloadCurrentCatData().then(() => {
        wx.stopPullDownRefresh();
        wx.showToast({
          title: '刷新成功',
          icon: 'success'
        });
      });
    } else {
      wx.stopPullDownRefresh();
    }
  },

  // 搜索输入处理
  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({ 
      searchKeyword: keyword 
    }, () => {
      this.filterCats();
    });
  },

  // 清除搜索
  clearSearch() {
    this.setData({ 
      searchKeyword: '' 
    }, () => {
      this.filterCats();
    });
  },

  // 综合筛选猫猫
  filterCats() {
    const { cats, filterCampus, searchKeyword } = this.data;
    
    let filteredCats = cats;
    
    // 位置筛选
    if (filterCampus !== 'all') {
      filteredCats = filteredCats.filter(cat => cat.campus === filterCampus);
    }
    
    // 搜索筛选
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase().trim();
      filteredCats = filteredCats.filter(cat => {
        // 安全地处理可能为 null 或 undefined 的字段
        const displayName = String(cat.displayName || '').toLowerCase();
        const nickname = String(cat.nickname || '').toLowerCase();
        const name = String(cat.name || '').toLowerCase();
        
        return displayName.includes(keyword) ||
               nickname.includes(keyword) ||
               name.includes(keyword);
      });
    }
    
    this.setData({ filteredCats });
  },

  // 返回信息页面
  goToInfoPage() {
    wx.navigateTo({
      url: '/pages/info/info'
    });
  },

  // 刷新猫猫列表
  async refreshCats() {
    this.setData({ searchKeyword: '' });
    await this.loadCats(true);
    await this.loadCurrentUserPhotosCount();
    await this.loadTotalStats();
    wx.showToast({
      title: '刷新成功',
      icon: 'success'
    });
  },

  // 加载更多猫猫数据
  async loadMoreCats() {
    if (this.data.loadingMore || !this.data.hasMore || this.data.loading) return;
    await this.loadCats(false);
  },

  // 加载当前用户上传的照片数量
  async loadCurrentUserPhotosCount() {
    try {
      if (!this.data.currentUser || !this.data.currentUser._id) {
        console.log("无法获取用户ID，跳过加载用户照片统计");
        return;
      }
      const openid = this.data.currentUser.openid;
      const result = await api.getUserStats({ openid });
      this.setData({
        'stats.currentUserPhotos': result.numUserPhotos
      });
    } catch (error) {
      console.error("加载用户照片统计失败:", error);
      this.setData({
        'stats.currentUserPhotos': 0
      });
    }
  },

  // 加载总的统计数据
  async loadTotalStats() {
    try {
      const result = await app.mpServerless.function.invoke('getCatStats');
      console.log('获取统计数据:', result);
      
      if (result.success && result.data) {
        const statsData = result.data;
        
        // 更新统计数据
        this.setData({
          stats: {
            ...this.data.stats,
            totalCats: statsData.basic.total,
            totalPhotos: statsData.month.totalPhotos
          },
          // 使用云函数返回的校区数据
          campuses: statsData.campus.map(item => ({
            name: item.campus,
            count: item.count
          }))
        });
      }
    } catch (error) {
      console.error('获取统计数据失败:', error);
    }
  },

  // 加载猫猫列表和位置信息
  async loadCats(refresh = false) {
    try {
      // 如果是刷新，重置分页参数
      if (refresh) {
        this.setData({ 
          pageNum: 1, 
          cats: [], 
          hasMore: true,
          loading: true 
        });
      } else {
        // 如果不是刷新且没有更多数据，则直接返回
        if (!this.data.hasMore) return;
        // 如果是加载更多，不显示全局loading
        this.setData({ loadingMore: true });
      }
      
      // 计算skip数量
      const skip = (this.data.pageNum - 1) * this.data.pageSize;
      
      // 按popularity降序排序（photo_count_total作为popularity的替代）
      const { result } = await app.mpServerless.db.collection('cat')
        .find({}, { 
          fields: ['_id', 'name', 'nickname', 'photo_count_best', 'photo_count_total', 'campus', 'popularity'],
          sort: { popularity: -1 },
          skip: skip,
          limit: this.data.pageSize
        });
      
      // 如果没有数据返回，说明已经没有更多数据了
      if (result.length === 0) {
        this.setData({ 
          hasMore: false,
          loading: false,
          loadingMore: false 
        });
        return;
      }
      
      // 获取头像信息
      const newCatsWithAvatar = await Promise.all(
        result.map(async (cat) => {
          try {
            const avatar = await getAvatar(cat._id, cat.photo_count_best);
            return {
              ...cat,
              avatar: avatar && avatar.photo_id ? avatar.photo_id : '/pages/public/images/app_logo.png',
              displayName: cat.name || cat.nickname || '未知猫猫',
              campus: cat.campus || '未知位置'
            };
          } catch (error) {
            console.error(`加载猫猫${cat._id}头像失败:`, error);
            return {
              ...cat,
              avatar: '/pages/public/images/app_logo.png',
              displayName: cat.name || cat.nickname || '未知猫猫',
              campus: cat.campus || '未知位置'
            };
          }
        })
      );
      
      // 合并新数据到现有列表
      const catsWithAvatar = refresh ? newCatsWithAvatar : [...this.data.cats, ...newCatsWithAvatar];

      // 更新页码和是否还有更多数据
      const hasMore = result.length === this.data.pageSize;
      const nextPageNum = this.data.pageNum + 1;

      // 获取总猫数和照片数
      const totalCats = await app.mpServerless.db.collection('cat').count();
      const totalPhotos = await app.mpServerless.db.collection('photo').count();

      this.setData({ 
        cats: catsWithAvatar,
        stats: { 
          totalCats: totalCats.total,
          totalPhotos: totalPhotos.total,
          currentUserPhotos: this.data.stats.currentUserPhotos
        },
        pageNum: nextPageNum,
        hasMore: hasMore,
        loading: false,
        loadingMore: false 
      }, () => {
        this.filterCats(); // 初始化筛选
      });
      
      return catsWithAvatar;
    } catch (error) {
      console.error("加载猫猫列表失败:", error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
      throw error;
    }
  },

  // 生成位置筛选列表
  generateCampuses(cats) {
    const campusMap = {};
    
    // 统计每个位置的猫猫数量
    cats.forEach(cat => {
      const campus = cat.campus || '未知位置';
      if (!campusMap[campus]) {
        campusMap[campus] = 0;
      }
      campusMap[campus]++;
    });
    
    // 转换为数组并排序
    const campuses = Object.keys(campusMap).map(name => ({
      name,
      count: campusMap[name]
    })).sort((a, b) => b.count - a.count);
    
    return campuses;
  },

  // 选择位置筛选
  selectCampusFilter(e) {
    const campus = e.currentTarget.dataset.campus;
    
    this.setData({ 
      filterCampus: campus
    }, () => {
      this.filterCats();
    });
  },

  // 直接选择猫猫（通过cat_id）
  async selectCatDirect(cat) {
    this.setData({ 
      selectedCat: cat,
      currentLevel: 'photos',
      filterUploader: 'all',
      filterBest: false,
      selectedUploader: null,
      photos: [],
      uploaders: [],
      currentCatPhotos: []
    });

    await this.loadCatPhotosAndUploaders(cat._id);
  },

  // 选择猫猫（用户点击）
  async selectCat(e) {
    const catId = e.currentTarget.dataset.catId;
    const cat = this.data.cats.find(c => c._id === catId);
    
    if (!cat) return;

    wx.showLoading({ title: '加载照片中...' });
    
    this.setData({ 
      selectedCat: cat,
      currentLevel: 'photos',
      filterUploader: 'all',
      filterBest: false,
      selectedUploader: null,
      photos: [],
      uploaders: [],
      currentCatPhotos: []
    });

    await this.loadCatPhotosAndUploaders(catId);
    wx.hideLoading();
  },

  // 加载猫猫的照片和上传者数据
  async loadCatPhotosAndUploaders(catId) {
    try {
      // 1. 加载该猫猫的所有照片
      const photos = await DbHelper.getPhotosByCatId(catId);
      console.log(`加载到${catId}的照片数量:`, photos.length);
      
      // 缓存当前猫猫的所有照片
      const bestCount = photos.filter(p => p.best).length;
      this.setData({ 
        currentCatPhotos: photos,
        bestCount
      });
      
      // 2. 加载上传者列表
      await this.loadUploadersForCat(catId, photos);
      
      // 3. 应用当前筛选条件显示照片
      await this.applyFiltersAndShowPhotos(photos);
      
    } catch (error) {
      console.error("加载猫猫数据失败:", error);
      wx.showToast({
        title: '加载照片失败',
        icon: 'error'
      });
    }
  },

  // 重新加载当前猫猫的数据
  async reloadCurrentCatData() {
    if (!this.data.selectedCat) return;
    
    wx.showLoading({ title: '刷新中...' });
    await this.loadCatPhotosAndUploaders(this.data.selectedCat._id);
    wx.hideLoading();
  },

  // 加载上传者列表
  async loadUploadersForCat(catId, photos) {
    try {
      console.log("处理上传者，照片数量:", photos.length);
      
      if (photos.length === 0) {
        this.setData({ uploaders: [] });
        return;
      }

      // 获取上传者ID列表
      const uploaderIds = [...new Set(photos.map(p => p.user_id).filter(id => id))];
      
      // 获取上传者信息
      const uploaders = [];
      
      for (const userId of uploaderIds) {
        try {
          let userInfo = {
            nickName: `用户${userId.slice(-4)}`,
            avatarUrl: '/pages/public/images/app_logo.png'
          };
          
          try {
            const userResult = await app.mpServerless.db.collection('user')
              .findOne({ _id: userId });
            if (userResult && userResult.result && userResult.result.userInfo) {
              userInfo = userResult.result.userInfo;
            }
          } catch (userError) {
            console.log(`用户${userId}信息获取失败，使用默认信息`);
          }

          const userPhotos = photos.filter(p => p.user_id === userId);
          uploaders.push({
            _id: userId,
            nickname: userInfo.nickName || `用户${userId.slice(-4)}`,
            avatar: userInfo.avatarUrl || '/pages/public/images/app_logo.png',
            totalPhotos: userPhotos.length,
            bestPhotos: userPhotos.filter(p => p.best).length
          });
        } catch (error) {
          console.error(`处理上传者${userId}失败:`, error);
        }
      }

      // 按照片数量排序
      uploaders.sort((a, b) => b.totalPhotos - a.totalPhotos);
      
      // 添加"全部"选项
      const allUploaders = [
        {
          _id: 'all',
          nickname: '全部上传者',
          avatar: '/pages/public/images/app_logo.png',
          totalPhotos: photos.length,
          bestPhotos: photos.filter(p => p.best).length
        },
        ...uploaders
      ];
      
      this.setData({ uploaders: allUploaders });
      
    } catch (error) {
      console.error("加载上传者列表失败:", error);
      this.setData({ uploaders: [] });
    }
  },

  // 应用筛选条件并显示照片
  async applyFiltersAndShowPhotos(photos) {
    let filteredPhotos = [...photos];
    
    // 精选筛选
    if (this.data.filterBest) {
      filteredPhotos = filteredPhotos.filter(p => p.best);
    }
    
    // 上传者筛选
    if (this.data.filterUploader !== 'all') {
      filteredPhotos = filteredPhotos.filter(p => p.user_id === this.data.filterUploader);
    }

    // 按时间倒序排列
    filteredPhotos.sort((a, b) => new Date(b.create_date) - new Date(a.create_date));

    this.setData({ photos: filteredPhotos });
  },

  // 选择上传者筛选
  async selectUploaderFilter(e) {
    const uploaderId = e.currentTarget.dataset.uploaderId;
    const uploader = this.data.uploaders.find(u => u._id === uploaderId);
    
    if (!uploader) return;

    this.setData({ 
      filterUploader: uploaderId,
      selectedUploader: uploaderId === 'all' ? null : uploader
    });

    await this.applyFiltersAndShowPhotos(this.data.currentCatPhotos);
  },

  // 切换精选筛选
  toggleBestFilter() {
    this.setData({ 
      filterBest: !this.data.filterBest 
    }, () => {
      if (this.data.currentLevel === 'photos' && this.data.currentCatPhotos.length > 0) {
        this.applyFiltersAndShowPhotos(this.data.currentCatPhotos);
      }
    });
  },

  // 返回上一级
  goBack() {
    const { currentLevel } = this.data;
    
    if (currentLevel === 'photos') {
      this.setData({ 
        currentLevel: 'cats',
        selectedCat: null,
        uploaders: [],
        photos: [],
        currentCatPhotos: [],
        editMode: false,
        selectedPhotos: [],
        filterUploader: 'all',
        filterBest: false
      });
    }
  },

  // 切换编辑模式
  toggleEditMode() {
    this.setData({ 
      editMode: !this.data.editMode,
      selectedPhotos: []
    });
  },

  // 选择/取消选择照片
  togglePhotoSelection(e) {
    if (!this.data.editMode) return;

    const photoId = e.currentTarget.dataset.photoId;

    console.log("当前照片信息： ", e.currentTarget.dataset)
    const selectedPhotos = [...this.data.selectedPhotos];

    
    const index = selectedPhotos.indexOf(photoId);
    if (index > -1) {
      selectedPhotos.splice(index, 1);
    } else {
      selectedPhotos.push(photoId);
    }
    console.log("当前已选择：", selectedPhotos)

    this.setData({ selectedPhotos });
  },

  // 显示删除确认
  showDeleteConfirm() {
    if (this.data.selectedPhotos.length === 0) {
      wx.showToast({
        title: '请先选择照片',
        icon: 'none'
      });
      return;
    }
    this.setData({ showDeleteConfirm: true });
  },

  // 隐藏删除确认
  hideDeleteConfirm() {
    this.setData({ showDeleteConfirm: false });
  },

  // 显示设为精选确认
  showSetBestConfirm() {
    if (this.data.selectedPhotos.length === 0) {
      wx.showToast({
        title: '请先选择照片',
        icon: 'none'
      });
      return;
    }
    this.setData({ showSetBestConfirm: true });
  },

  // 隐藏设为精选确认
  hideSetBestConfirm() {
    this.setData({ showSetBestConfirm: false });
  },

  // 显示取消精选确认
  showCancelBestConfirm() {
    if (this.data.selectedPhotos.length === 0) {
      wx.showToast({
        title: '请先选择照片',
        icon: 'none'
      });
      return;
    }
    this.setData({ showCancelBestConfirm: true });
  },

  // 隐藏取消精选确认
  hideCancelBestConfirm() {
    this.setData({ showCancelBestConfirm: false });
  },

  // 调用云函数处理照片操作
  async callPhotoManager(photo, type, extraParams = {}) {
    try {
      const openid = this.data.currentUser.openid;
      const result = await app.mpServerless.function.invoke('managePhoto', {
        openid: openid,
        photo: photo,
        type: type,
        ...extraParams
      });
      
      return result;
    } catch (error) {
      console.error(`调用云函数 photoManager 失败 (type: ${type}):`, error);
      throw error;
    }
  },

  // 确认批量设为精选
  async confirmBatchSetBest() {
    this.setData({ showSetBestConfirm: false });
    
    try {
      wx.showLoading({ title: '操作中...' });
      
      // 批量调用云函数
      const promises = this.data.selectedPhotos.map(photoId => {
        const photo = this.data.currentCatPhotos.find(p => p._id === photoId);
        if (!photo) return Promise.resolve();
        
        return this.callPhotoManager(photo, 'setBest', { best: true });
      });
      
      await Promise.all(promises);

      // 重新加载当前猫猫数据以获取最新状态
      await this.reloadCurrentCatData();

      wx.showToast({
        title: `已设置${this.data.selectedPhotos.length}张精选`,
        icon: 'success'
      });

      this.setData({ 
        selectedPhotos: []
      });

    } catch (error) {
      console.error("批量设置精选失败:", error);
      wx.hideLoading();
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
    }
  },

  // 确认批量取消精选
  async confirmBatchCancelBest() {
    this.setData({ showCancelBestConfirm: false });
    
    try {
      wx.showLoading({ title: '操作中...' });
      
      // 批量调用云函数
      const promises = this.data.selectedPhotos.map(photoId => {
        const photo = this.data.currentCatPhotos.find(p => p._id === photoId);
        if (!photo) return Promise.resolve();
        
        return this.callPhotoManager(photo, 'setBest', { best: false });
      });
      
      await Promise.all(promises);

      // 重新加载当前猫猫数据以获取最新状态
      await this.reloadCurrentCatData();

      wx.showToast({
        title: `已取消${this.data.selectedPhotos.length}张精选`,
        icon: 'success'
      });

      this.setData({ 
        selectedPhotos: []
      });

    } catch (error) {
      console.error("批量取消精选失败:", error);
      wx.hideLoading();
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
    }
  },

  // 确认批量删除
  async confirmBatchDelete() {
    this.setData({ showDeleteConfirm: false });
    
    try {
      wx.showLoading({ title: '删除中...' });
      
      // 批量调用云函数
      const promises = this.data.selectedPhotos.map(photoId => {
        const photo = this.data.currentCatPhotos.find(p => p._id === photoId);
        if (!photo) return Promise.resolve();
        
        return this.callPhotoManager(photo, 'delete');
      });
      
      await Promise.all(promises);

      // 重新加载当前猫猫数据以获取最新状态
      await this.reloadCurrentCatData();

      // 更新用户照片统计
      await this.loadCurrentUserPhotosCount();

      wx.showToast({
        title: `已删除${this.data.selectedPhotos.length}张照片`,
        icon: 'success'
      });
  
      this.setData({ 
        selectedPhotos: []
      });

    } catch (error) {
      console.error("批量删除失败:", error);
      wx.hideLoading();
      wx.showToast({
        title: '删除失败',
        icon: 'error'
      });
    }
  },

  // 预览照片
  previewPhoto(e) {
    if (this.data.editMode) return;
    
    const photoId = e.currentTarget.dataset.photoId;
    const photo = this.data.photos.find(p => p._id === photoId);
    
    if (!photo) return;

    const urls = this.data.photos
      .filter(p => p.photo_compressed || p.photo_watermark)
      .map(p => p.photo_compressed || p.photo_watermark);

    const currentUrl = photo.photo_compressed || photo.photo_watermark;
    const currentIndex = urls.indexOf(currentUrl);

    wx.previewImage({
      urls: urls,
      current: currentIndex >= 0 ? urls[currentIndex] : currentUrl
    });
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 空函数，用于阻止事件冒泡
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: `${this.data.text_cfg.app_name} - 图片管理`,
      path: '/pages/manage/photoManagement/photoManagement'
    };
  },

  onShareTimeline() {
    return {
      title: `${this.data.text_cfg.app_name} - 图片管理`
    };
  }
});