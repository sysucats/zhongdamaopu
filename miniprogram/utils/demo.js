// 离线 Demo 模式 —— 无需后端即可可视化调试

function isDemoMode() {
  const app = getApp();
  return !!(app && app.globalData && app.globalData.demoMode);
}

// 校园猫咪 Demo 数据
const DEMO_CATS = [
  { _id: 'demo-cat-1', name: '大橘', campus: '南校园', area: '北门花坛', birthday: '2023-01-01' },
  { _id: 'demo-cat-2', name: '三花', campus: '南校园', area: '法学院边草坪', birthday: '2022-06-15' },
  { _id: 'demo-cat-3', name: '小黑', campus: '南校园', area: '荣光堂', birthday: '2023-03-20' },
  { _id: 'demo-cat-4', name: '小白', campus: '南校园', area: '图书馆广场', birthday: '2024-01-10' },
  { _id: 'demo-cat-5', name: '奶茶', campus: '南校园', area: '英东体育场', birthday: '2023-09-05' },
  { _id: 'demo-cat-6', name: '芝麻', campus: '南校园', area: '园东湖', birthday: '2022-11-18' },
  { _id: 'demo-cat-7', name: '年糕', campus: '南校园', area: '逸夫楼', birthday: '2024-02-28' },
  { _id: 'demo-cat-8', name: '团子', campus: '南校园', area: '第一教学楼', birthday: '2023-07-12' },
  { _id: 'demo-cat-9', name: '花生', campus: '南校园', area: '怀士堂', birthday: '2023-04-22' },
  { _id: 'demo-cat-10', name: '汤圆', campus: '南校园', area: '东门', birthday: '2024-05-01' },
  { _id: 'demo-cat-11', name: '布丁', campus: '南校园', area: '惺亭', birthday: '2022-08-30' },
];

const DEMO_PHOTOS = [
  { cat_id: 'demo-cat-1', latitude: 23.102685, longitude: 113.299872,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-15', shooting_date: '2026-05-10', photographer: '猫友小王' },
  { cat_id: 'demo-cat-2', latitude: 23.096856, longitude: 113.297080,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-14', shooting_date: '2026-05-09', photographer: '猫友小李' },
  { cat_id: 'demo-cat-3', latitude: 23.099602, longitude: 113.299638,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-13', shooting_date: '2026-05-08', photographer: '匿名猫友' },
  { cat_id: 'demo-cat-4', latitude: 23.100800, longitude: 113.296500,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-12', shooting_date: '2026-05-07', photographer: '猫友小张' },
  { cat_id: 'demo-cat-5', latitude: 23.104200, longitude: 113.294800,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-11', shooting_date: '2026-05-06', photographer: '猫友小赵' },
  { cat_id: 'demo-cat-6', latitude: 23.098500, longitude: 113.301200,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-10', shooting_date: '2026-05-05', photographer: '匿名猫友' },
  { cat_id: 'demo-cat-7', latitude: 23.101500, longitude: 113.298000,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-09', shooting_date: '2026-05-04', photographer: '猫友小陈' },
  { cat_id: 'demo-cat-8', latitude: 23.103000, longitude: 113.297500,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-08', shooting_date: '2026-05-03', photographer: '匿名猫友' },
  { cat_id: 'demo-cat-9', latitude: 23.099000, longitude: 113.298500,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-07', shooting_date: '2026-05-02', photographer: '猫友小周' },
  { cat_id: 'demo-cat-10', latitude: 23.105000, longitude: 113.300500,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-06', shooting_date: '2026-05-01', photographer: '匿名猫友' },
  { cat_id: 'demo-cat-11', latitude: 23.097500, longitude: 113.295000,
    photo_id: '/pages/public/images/system/user.png',
    create_date: '2026-05-05', shooting_date: '2026-04-30', photographer: '猫友小吴' },
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

// 链式查询 mock
class MockChainQuery {
  constructor() {
    this._ops = [];
  }
  where(c) { this._ops.push(['where', c]); return this; }
  orderBy(f, d) { this._ops.push(['orderBy', f, d]); return this; }
  limit(n) { this._ops.push(['limit', n]); return this; }
  field(p) { this._ops.push(['field', p]); return this; }
  async get() { return { result: [] }; }
}

// 默认设置数据，避免各页面因 settings 为 null 而弹"网络小故障"
const MOCK_SETTINGS = {
  pages: {
    _id: 'pages',
    genealogy: { catsStep: 1, main_lower_threshold: 0, adStep: 0, photoPopWeight: 10 },
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
    recognize_test: {},
  },
  filter: { _id: 'filter', campuses: [], area: [], colour: [] },
  subscribeMsg: { _id: 'subscribeMsg', verifyPhoto: { triggerNum: 999 } },
};

function createMockMpServerless() {
  const db = {
    command: {
      neq: (v) => ({ $ne: v }),
      in: (arr) => ({ $in: arr }),
    },
    collection(name) {
      return {
        where: (c) => new MockChainQuery().where(c),
        findOne: async (query, opts) => {
          // 对 setting 表返回默认值，避免页面崩溃
          if (name === 'setting' && query && query._id) {
            const preset = MOCK_SETTINGS[query._id];
            if (preset) return { result: preset };
          }
          return { result: null };
        },
        find: async (query, opts) => ({ result: [] }),
        count: async (query) => ({ result: 0 }),
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
};
