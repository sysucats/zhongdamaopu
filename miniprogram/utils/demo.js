// 离线 Demo 模式 —— 无需后端即可可视化调试

function isDemoMode() {
  const app = getApp();
  return !!(app && app.globalData && app.globalData.demoMode);
}

// 校园猫咪 Demo 数据
const DEMO_CATS = [
  { _id: 'demo-cat-1', name: '大橘', campus: '南校园', area: '北门花坛', birthday: '2023-01-01', colour: '橘', character: '亲人', characteristics: '亲人', habit: '喜欢晒太阳', popularity: 100, gender: '公', status_adopt: '1' },
  { _id: 'demo-cat-2', name: '三花', campus: '南校园', area: '法学院边草坪', birthday: '2022-06-15', colour: '三花', character: '文静', characteristics: '文静', habit: '喜欢躲在草丛', popularity: 85, gender: '母', status_adopt: '0' },
  { _id: 'demo-cat-3', name: '小黑', campus: '南校园', area: '荣光堂', birthday: '2023-03-20', colour: '黑', character: '胆小', characteristics: '胆小', habit: '晚上出没', popularity: 70, gender: '公', status_adopt: '0' },
  { _id: 'demo-cat-4', name: '小白', campus: '南校园', area: '图书馆广场', birthday: '2024-01-10', colour: '白', character: '粘人', characteristics: '粘人', habit: '喜欢蹭人', popularity: 120, gender: '母', status_adopt: '2' },
  { _id: 'demo-cat-5', name: '奶茶', campus: '南校园', area: '英东体育场', birthday: '2023-09-05', colour: '橘白', character: '贪吃', characteristics: '贪吃', habit: '对罐头没有抵抗力', popularity: 95, gender: '公', status_adopt: '0' },
  { _id: 'demo-cat-6', name: '芝麻', campus: '南校园', area: '园东湖', birthday: '2022-11-18', colour: '黑', character: '好动', characteristics: '好动', habit: '追逐小鸟', popularity: 80, gender: '母', status_adopt: '0' },
  { _id: 'demo-cat-7', name: '年糕', campus: '南校园', area: '逸夫楼', birthday: '2024-02-28', colour: '白', character: '温顺', characteristics: '温顺', habit: '喜欢在楼前趴着', popularity: 110, gender: '母', status_adopt: '1' },
  { _id: 'demo-cat-8', name: '团子', campus: '南校园', area: '第一教学楼', birthday: '2023-07-12', colour: '橘', character: '慵懒', characteristics: '慵懒', habit: '整天睡觉', popularity: 90, gender: '公', status_adopt: '0' },
  { _id: 'demo-cat-9', name: '花生', campus: '南校园', area: '怀士堂', birthday: '2023-04-22', colour: '奶牛', character: '机灵', characteristics: '机灵', habit: '会讨食物', popularity: 105, gender: '公', status_adopt: '0' },
  { _id: 'demo-cat-10', name: '汤圆', campus: '南校园', area: '东门', birthday: '2024-05-01', colour: '白', character: '害羞', characteristics: '害羞', habit: '躲在角落', popularity: 75, gender: '母', status_adopt: '2' },
  { _id: 'demo-cat-11', name: '布丁', campus: '南校园', area: '惺亭', birthday: '2022-08-30', colour: '橘白', character: '傲娇', characteristics: '傲娇', habit: '若即若离', popularity: 88, gender: '母', status_adopt: '0' },
];

const DEMO_PHOTOS = [
  { cat_id: 'demo-cat-1', latitude: 23.102685, longitude: 113.299872, verified: true,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-15', shooting_date: '2026-05-10', photographer: '猫友小王', marker_type: 'orange' },
  { cat_id: 'demo-cat-2', latitude: 23.096856, longitude: 113.297080, verified: true,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-14', shooting_date: '2026-05-09', photographer: '猫友小李', marker_type: 'calico' },
  { cat_id: 'demo-cat-3', latitude: 23.099602, longitude: 113.299638, verified: true,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-13', shooting_date: '2026-05-08', photographer: '匿名猫友', marker_type: 'black' },
  { cat_id: 'demo-cat-4', latitude: 23.100800, longitude: 113.296500, verified: true,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-12', shooting_date: '2026-05-07', photographer: '猫友小张', marker_type: 'white' },
  { cat_id: 'demo-cat-5', latitude: 23.104200, longitude: 113.294800, verified: true,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-11', shooting_date: '2026-05-06', photographer: '猫友小赵', marker_type: 'orange' },
  { cat_id: 'demo-cat-6', latitude: 23.098500, longitude: 113.301200, verified: true,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-10', shooting_date: '2026-05-05', photographer: '匿名猫友', marker_type: 'black' },
  { cat_id: 'demo-cat-7', latitude: 23.101500, longitude: 113.298000, verified: true,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-09', shooting_date: '2026-05-04', photographer: '猫友小陈', marker_type: 'white' },
  { cat_id: 'demo-cat-8', latitude: 23.103000, longitude: 113.297500, verified: true,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-08', shooting_date: '2026-05-03', photographer: '匿名猫友', marker_type: 'orange' },
  { cat_id: 'demo-cat-9', latitude: 23.099000, longitude: 113.298500, verified: true,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-07', shooting_date: '2026-05-02', photographer: '猫友小周', marker_type: 'tabby' },
  { cat_id: 'demo-cat-10', latitude: 23.105000, longitude: 113.300500, verified: true,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-06', shooting_date: '2026-05-01', photographer: '匿名猫友', marker_type: 'white' },
  { cat_id: 'demo-cat-11', latitude: 23.097500, longitude: 113.295000, verified: true,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-05', shooting_date: '2026-04-30', photographer: '猫友小吴', marker_type: 'calico' },
];

const DEMO_MARKER_ICONS = [
  { _id: 'mi-1', name: '白猫', img: '/images/markers/white.jpg', enabled: true },
  { _id: 'mi-2', name: '黑猫', img: '/images/markers/black.jpg', enabled: true },
  { _id: 'mi-3', name: '橘猫', img: '/images/markers/orange.jpg', enabled: true },
  { _id: 'mi-4', name: '蓝猫', img: '/images/markers/blue.jpg', enabled: true },
  { _id: 'mi-5', name: '狸花', img: '/images/markers/tabby.jpg', enabled: true },
  { _id: 'mi-6', name: '三花', img: '/images/markers/calico.jpg', enabled: true },
];

const DEMO_PENDING_USERS = [
  { _id: 'demo-user-2', openid: 'demo-openid-2', userInfo: { nickName: '测试用户2', avatarUrl: '' }, manager: 0, mapAccess: { status: 'pending', applyReason: '我想看看校园里猫猫的分布情况', applyDate: '2026-05-20' } },
];

function getDemoMapData() {
  const catMap = {};
  DEMO_CATS.forEach(c => { catMap[c._id] = c; });

  const allPhotos = [...DEMO_PHOTOS].sort(
    (a, b) => new Date(b.create_date) - new Date(a.create_date)
  );

  return { allPhotos, catMap };
}

function getDemoCat(catId) {
  return DEMO_CATS.find(c => c._id === catId) || DEMO_CATS[0];
}

// 链式查询 mock —— 支持简单筛选、排序、分页
class MockChainQuery {
  constructor(collectionName, dataSource) {
    this._collectionName = collectionName;
    this._dataSource = dataSource || [];
    this._whereFilter = null;
    this._limitCount = null;
    this._orderField = null;
    this._orderDir = 'asc';
  }
  where(c) { this._whereFilter = c; return this; }
  orderBy(f, d) { this._orderField = f; this._orderDir = d; return this; }
  limit(n) { this._limitCount = n; return this; }
  field(p) { return this; }

  async get() {
    let data = [...this._dataSource];

    if (this._whereFilter) {
      data = data.filter(item => {
        return Object.keys(this._whereFilter).every(key => {
          const cond = this._whereFilter[key];
          if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
            if (cond.$ne !== undefined) return item[key] !== cond.$ne;
            if (cond.$in !== undefined) return cond.$in.includes(item[key]);
            if (cond.$eq !== undefined) return item[key] === cond.$eq;
            return true;
          }
          return item[key] === cond;
        });
      });
    }

    if (this._orderField) {
      const dir = this._orderDir === 'desc' ? -1 : 1;
      data.sort((a, b) => {
        const va = a[this._orderField];
        const vb = b[this._orderField];
        if (va < vb) return -dir;
        if (va > vb) return dir;
        return 0;
      });
    }

    if (this._limitCount != null) {
      data = data.slice(0, this._limitCount);
    }

    return { result: data };
  }
}

// 默认设置数据
const MOCK_SETTINGS = {
  pages: {
    _id: 'pages',
    genealogy: { catsStep: 1 },
    tabBarCtrl: {
      fullTab: 'genealogy,followFeed,news,leaderboard,info,map',
      ctrlTab: ''
    },
    accessCtrl: {
      ctrlUser: '',
      ctrlVersion: '*',
      disabledFunc: '',
      limitedFunc: ''
    },
    ads: null,
    detailCat: {},
    recognize: {},
  },
  filter: { _id: 'filter', campuses: ['南校园'], area: [], colour: [] },
  friendLink: { _id: 'friendLink', apps: [] },
  subscribeMsg: { _id: 'subscribeMsg', verifyPhoto: { triggerNum: 999 } },
};

function _matchFilter(item, whereFilter) {
  if (!whereFilter) return true;
  return Object.keys(whereFilter).every(key => {
    const cond = whereFilter[key];
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if (cond.$ne !== undefined) return item[key] !== cond.$ne;
      if (cond.$in !== undefined) return cond.$in.includes(item[key]);
      if (cond.$gt !== undefined) return item[key] > cond.$gt;
      if (cond.$lt !== undefined) return item[key] < cond.$lt;
      return true;
    }
    return item[key] === cond;
  });
}

function createMockMpServerless() {
  const db = {
    command: {
      neq: (v) => ({ $ne: v }),
      in: (arr) => ({ $in: arr }),
      gt: (v) => ({ $gt: v }),
    },
    collection(name) {
      return {
        where: (c) => {
          if (name === 'cat') return new MockChainQuery(name, DEMO_CATS).where(c);
          if (name === 'photo') return new MockChainQuery(name, DEMO_PHOTOS).where(c);
          return new MockChainQuery(name, []).where(c);
        },
        findOne: async (query, opts) => {
          if (name === 'setting' && query && query._id) {
            const preset = MOCK_SETTINGS[query._id];
            if (preset) return { result: preset };
          }
          if (name === 'cat' && query && query._id) {
            const cat = DEMO_CATS.find(c => c._id === query._id);
            return { result: cat || null };
          }
          if (name === 'user') {
            return { result: { _id: 'demo-user', openid: 'demo-openid', userInfo: { nickName: '管理员', avatarUrl: '' }, role: 'manager', manager: 99, mapAccess: { status: 'approved', applyReason: '管理员手动开通', applyDate: '2026-05-01' }, followCats: DEMO_CATS.map(c => c._id) } };
          }
          if (name === 'marker_icon' && query && query._id) {
            const icon = DEMO_MARKER_ICONS.find(i => i._id === query._id);
            return { result: icon || null };
          }
          return { result: null };
        },
        find: async (query, opts) => {
          if (name === 'setting' && query && query._id && MOCK_SETTINGS[query._id]) {
            return { result: MOCK_SETTINGS[query._id] };
          }
          let data = [];
          if (name === 'cat') data = DEMO_CATS;
          if (name === 'photo') data = DEMO_PHOTOS;
          if (name === 'marker_icon') data = DEMO_MARKER_ICONS;
          if (name === 'user' && query && query['mapAccess.status'] === 'pending') {
            data = DEMO_PENDING_USERS;
          }
          // 简单筛选
          if (query && Object.keys(query).length) {
            data = data.filter(item => _matchFilter(item, query));
          }
          // 排序
          if (opts && opts.sort) {
            const fields = Object.keys(opts.sort);
            if (fields.length) {
              const field = fields[0];
              const dir = opts.sort[field] === -1 ? -1 : 1;
              data.sort((a, b) => {
                if ((a[field] || 0) < (b[field] || 0)) return -dir;
                if ((a[field] || 0) > (b[field] || 0)) return dir;
                return 0;
              });
            }
          }
          // 分页
          if (opts && typeof opts.skip === 'number') {
            data = data.slice(opts.skip);
          }
          if (opts && typeof opts.limit === 'number') {
            data = data.slice(0, opts.limit);
          }
          return { result: data };
        },
        count: async (query) => {
          if (name === 'photo') return { result: DEMO_PHOTOS.length };
          if (name === 'cat') return { result: DEMO_CATS.length };
          if (name === 'marker_icon') return { result: DEMO_MARKER_ICONS.length };
          if (name === 'user' && query && query['mapAccess.status'] === 'pending') return { result: DEMO_PENDING_USERS.length };
          return { result: 0 };
        },
        insertOne: async (data) => ({ id: 'mock-' + Date.now() }),
        updateOne: async (query, data) => ({ updated: 1 }),
        deleteOne: async (query) => ({ deleted: 1 }),
        findOneAndUpdate: async (query, data) => ({ result: null }),
      };
    }
  };

  return {
    db,
    function: {
      async invoke(name, params) {
        return { result: { ok: true, data: null } };
      }
    },
    user: {
      async getInfo(opts) {
        return { success: true, result: { user: { oAuthUserId: 'demo-openid' } } };
      }
    },
    file: {
      async uploadFile(opts) {
        return { fileUrl: 'https://demo.cos.local/photo.jpg', fileId: 'demo-file-' + Date.now() };
      }
    },
    init: () => {},
  };
}

module.exports = {
  isDemoMode,
  DEMO_CATS,
  DEMO_PHOTOS,
  getDemoMapData,
  getDemoCat,
  createMockMpServerless,
  DEMO_MARKER_ICONS,
};
