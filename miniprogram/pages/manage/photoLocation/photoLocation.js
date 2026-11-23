// 定位体检：找出喵地图上可能标错的照片
// 地图只认 verified=true + 未删除 + 有经纬度的照片，且每只猫只取 shooting_date 最新的那张当锚点。
// 这里把「会影响地图」的照片全列出来，自动标出离群 / 校区外 / 坐标异常 / 日期格式不对的，并支持就地修正。
import { checkAuth } from "../../../utils/user";
import { loadFilter } from "../../../utils/page";
import config from "../../../config";
import api from "../../../utils/cloudApi";
import { signCosUrl } from "../../../utils/common";

const app = getApp();

const PAGE_SIZE = 100;      // 单次拉取条数
const MAX_PAGES = 10;       // 最多 1000 张，防呆
const OUTLIER_M = 300;      // 离该猫其它点的中位距离超过这个值 → 判为离群
const PAIR_FAR_M = 1000;    // 只有两个点时，相距超过 1 公里 → 提示
const TOLERANCE_M = 30;     // 校区圈边容差（与 addPhoto 选点保持一致）
const DEFAULT_AREA_RADIUS = 800; // 校区没配半径时的默认可标点半径（米）
const RENDER_CAP = 600;     // 「全部」模式最多渲染多少条，避免一次 setData 过大
const EARTH_R = 6371000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SIGN_BATCH = 10;      // 缩略图并发签名数：握手太多会被 COS 限流，太少又慢

// 一次只拉「会影响喵地图的照片」全集，客户端再分成「有定位 / 缺定位」两组。
// 不写 { location: null } 这类查询：EMAS 客户端对 null 与字段不存在、$exists 的语义
// 并不可靠（commentBoard 里已为此改成客户端过滤），拉全集自己分最稳。
const PHOTO_PROJECTION = {
  cat_id: 1,
  photo_id: 1,
  photo_compressed: 1,   // 有压缩图时优先用，缩略图省流量
  shooting_date: 1,
  latitude: 1,
  longitude: 1,
  photographer: 1,
};

// 两点球面距离（米）
function distanceMeters(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.pow(Math.sin(dLat / 2), 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.pow(Math.sin(dLng / 2), 2);
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

function fmtMeters(m) {
  if (!isFinite(m)) return "—";
  if (m >= 1000) return (m / 1000).toFixed(1) + " km";
  return Math.round(m) + " m";
}

Page({
  data: {
    auth: false,
    tipText: "",
    tipBtn: true,
    loading: true,
    mode: "suspect",          // suspect 只看可疑 / all 全部 / missing 缺定位
    keyword: "",
    keywordInput: "",
    viewGroups: [],
    missingGroups: [],        // 已过审但没写坐标的照片（进不了地图）
    stat: { cats: 0, photos: 0, suspect: 0, missing: 0 },
    campusCount: 0,
    truncated: false,         // 拉到上限还有更多
    renderTruncated: false,   // 「全部」模式渲染被截断
    maxShown: PAGE_SIZE * MAX_PAGES,
    // 地图选点浮层
    mapPickerVisible: false,
    mapPickerConfirming: false,
    mapPickerInitLat: 0,
    mapPickerInitLng: 0,
    mapPickerScale: 17,
    pageMetaStyle: "",
  },

  onLoad() {
    this.jsData = { groups: [], photos: [], missingPhotos: [], missingGroups: [] };
    this._thumbRaw = {};     // _id → 原始 COS 地址（不塞进 data，别让视图层多背一份）
    this._pointById = {};    // _id → point 对象，改 thumb 状态时不必遍历
    this._thumbBad = {};     // _id → 已经加载失败过，别反复重试
    this.init();
  },

  async init() {
    const ok = await checkAuth(this, 2);
    if (!ok) return;
    await this.loadAreas();
    await this.loadData();
  },

  async onPullDownRefresh() {
    if (this.data.auth) await this.loadData();
    wx.stopPullDownRefresh();
  },

  onUnload() {
    // 签名队列是异步的，页面已经退了就别再 setData（真机上会报 warn）
    this._unloaded = true;
    clearTimeout(this._signTimer);
    this._signTimer = null;
  },

  // ==================== 数据加载 ====================

  // 校区中心 + 可标点半径：取自 setting.filter.campusCenters，
  // 结构是 { 校区名: { latitude, longitude, scale, radius? } }。
  // radius 是可选项，没配时按 800 米兜底；一个校区都没配时不判「超出校区范围」，
  // 坐标合法性、离群、日期格式这几项照常生效。
  async loadAreas() {
    let centers = {};
    try {
      const filter = await loadFilter({ nocache: true });
      centers = (filter && filter.campusCenters) || {};
    } catch (e) {
      console.warn("[loadAreas] - 读取校区中心失败:", e);
    }
    const areas = [];
    Object.keys(centers).forEach((name) => {
      const c = centers[name] || {};
      if (c.latitude == null || c.longitude == null) return;
      const radius = Number(c.radius) > 0 ? Number(c.radius) : DEFAULT_AREA_RADIUS;
      areas.push({
        name,
        latitude: Number(c.latitude),
        longitude: Number(c.longitude),
        radius,
        scale: Number(c.scale) || 15,
      });
    });
    this._areas = areas;
    this.setData({ campusCount: areas.length });
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const photos = await this.fetchPhotos();
      await this.attachCats(photos);

      const located = [];
      const missing = [];
      photos.forEach((p) => {
        (this.hasLocation(p) ? located : missing).push(p);
      });

      this.jsData.photos = located;
      this.jsData.missingPhotos = missing;
      this.jsData.groups = this.buildAllGroups(located);
      this.jsData.missingGroups = this.buildMissingGroups(missing);
      this.applyGroups();
    } catch (e) {
      console.error("[loadData] - 加载失败:", e);
      wx.showToast({ title: "加载失败，请下拉重试", icon: "none" });
      this.setData({ viewGroups: [] });
    }
    this.setData({ loading: false });
  },

  // 分页拉取最近一批已过审照片（含有没有坐标的），上限 MAX_PAGES * PAGE_SIZE 张
  async fetchPhotos() {
    const qf = { verified: true, deleted: { $ne: 1 } };
    const all = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { result } = await app.mpServerless.db.collection("photo").find(qf, {
        sort: { shooting_date: -1, _id: -1 },
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        projection: PHOTO_PROJECTION,
      });
      const list = result || [];
      all.push(...list);
      if (list.length < PAGE_SIZE) {
        this.setData({ truncated: false });
        return all;
      }
    }
    this.setData({ truncated: true });
    return all;
  },

  // 批量补猫名 / 校区（每 20 个一批 $in）；多次调用是「合并」不是覆盖
  async attachCats(photos) {
    const ids = [...new Set((photos || []).map((p) => p.cat_id).filter(Boolean))];
    const map = this._catMap || {};
    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20);
      const { result } = await app.mpServerless.db.collection("cat").find(
        { _id: { $in: chunk } },
        { projection: { name: 1, campus: 1, area: 1 } }
      );
      (result || []).forEach((c) => { map[c._id] = c; });
    }
    this._catMap = map;
  },

  // ==================== 判定逻辑 ====================

  toNum(v) {
    if (v === null || v === undefined || v === "") return NaN;
    const n = Number(v);
    return isFinite(n) ? n : NaN;
  },

  isCoordOk(lat, lng) {
    return (
      isFinite(lat) && isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0)
    );
  },

  hasLocation(p) {
    return p && p.latitude != null && p.longitude != null;
  },

  // 落在任一校区圈内（含 30 米容差）；没配校区中心时不判
  campusOf(lat, lng) {
    const areas = this._areas || [];
    if (!areas.length || !isFinite(lat) || !isFinite(lng)) return null;
    for (let i = 0; i < areas.length; i++) {
      const a = areas[i];
      const d = distanceMeters(lat, lng, a.latitude, a.longitude);
      if (d <= a.radius + TOLERANCE_M) return { area: a, distance: d };
    }
    return { area: null, distance: NaN };
  },

  median(nums) {
    const s = nums.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  },

  buildAllGroups(photos) {
    const byCat = {};
    (photos || []).forEach((p) => {
      const cid = p.cat_id || "__unknown__";
      (byCat[cid] = byCat[cid] || []).push(p);
    });
    return Object.keys(byCat).map((cid) => this.buildGroup(cid, byCat[cid]));
  },

  // 登记缩略图原始地址；返回值是「现在就能渲染的 src」
  // 项目用的是私有 COS 桶，photo_id 原样塞给 image 会 403 / ERR_ABORTED，
  // 必须先用 signCosUrl 签一次（与 detailCat、猫谱头像同一套规则）。
  registerThumb(p) {
    if (!p || !p._id) return "";
    const raw = p.photo_compressed || p.photo_id || "";
    this._thumbRaw[p._id] = raw;
    if (!raw) return "";
    if (!/^https?:/i.test(raw)) return raw;   // 本地图 / 相对路径，不用签
    return "";                                // COS 图：等 signThumbs 批量签
  },

  // 单只猫：算中位中心、标锚点、标可疑项
  buildGroup(catId, photos) {
    const list = (photos || []).slice().sort((a, b) => {
      const da = String(a.shooting_date || "");
      const db = String(b.shooting_date || "");
      if (da !== db) return da < db ? 1 : -1;      // 日期倒序（字符串比较，与云函数一致）
      return String(a._id) < String(b._id) ? 1 : -1; // 同日期按 _id 倒序
    });

    const cat = (this._catMap || {})[catId] || {};
    const valid = list.filter((p) => {
      const lat = this.toNum(p.latitude);
      const lng = this.toNum(p.longitude);
      return this.isCoordOk(lat, lng);
    });
    const center = valid.length
      ? {
          lat: this.median(valid.map((p) => this.toNum(p.latitude))),
          lng: this.median(valid.map((p) => this.toNum(p.longitude))),
        }
      : null;

    // 只有两个点时，算一下它们相距多远，用来提示「可能一个对一个错」
    let pairDist = NaN;
    if (valid.length === 2) {
      const a = valid[0];
      const b = valid[1];
      pairDist = distanceMeters(
        this.toNum(a.latitude), this.toNum(a.longitude),
        this.toNum(b.latitude), this.toNum(b.longitude)
      );
    }

    const points = list.map((p, i) => {
      const lat = this.toNum(p.latitude);
      const lng = this.toNum(p.longitude);
      const coordOk = this.isCoordOk(lat, lng);
      const isAnchor = i === 0;
      const date = String(p.shooting_date || "");
      const tags = [];
      let suspect = false;

      if (!coordOk) {
        tags.push({ text: "坐标异常", kind: "danger" });
        suspect = true;
      }
      if (!DATE_RE.test(date)) {
        tags.push({ text: "拍摄日期格式不对", kind: "warn" });
        suspect = true;
      }

      let dist = NaN;
      if (coordOk && center) {
        dist = distanceMeters(lat, lng, center.lat, center.lng);
        const inCampus = this.campusOf(lat, lng);
        if (inCampus && !inCampus.area) {
          tags.push({ text: "不在任何校区范围内", kind: "danger" });
          suspect = true;
        }
        if (valid.length >= 3 && dist > OUTLIER_M) {
          tags.push({ text: "离群", kind: "warn" });
          suspect = true;
        }
        if (valid.length === 2 && pairDist > PAIR_FAR_M) {
          tags.push({ text: "两点相距 " + fmtMeters(pairDist), kind: "warn" });
          suspect = true;
        }
      }

      return {
        _id: p._id,
        photo_id: p.photo_id || "",
        thumb: this.registerThumb(p),
        thumbBad: false,
        latitude: p.latitude,
        longitude: p.longitude,
        raw_lat: lat,
        raw_lng: lng,
        date: date || "（未填日期）",
        coordText: coordOk
          ? lat.toFixed(6) + ", " + lng.toFixed(6)
          : (p.latitude === "" || p.longitude === "" ? "坐标是空字符串" : "坐标无法解析"),
        distText: isFinite(dist) ? fmtMeters(dist) : "",
        isAnchor,
        suspect,
        tags,
      };
    });

    // 可疑的排前面，其次按日期倒序（原顺序已是日期倒序，sort 稳定）
    points.sort((a, b) => (b.suspect ? 1 : 0) - (a.suspect ? 1 : 0));

    // 锚点 = 日期最新那张，它就是地图上这个猫头的位置来源
    const anchor = points.filter((p) => p.isAnchor)[0] || null;

    return {
      cat_id: catId,
      cat_name: cat.name || (catId === "__unknown__" ? "未关联猫猫" : "（猫猫已删除）"),
      // 猫文档没了 / 没关联：脏数据兜底，排序时压到最后，别挡在正常猫前面
      orphan: catId === "__unknown__" || !cat.name,
      subtitle: [cat.campus, cat.area].filter(Boolean).join(" · ") || "未填常驻地",
      total: points.length,
      suspectCount: points.filter((p) => p.suspect).length,
      anchorDate: anchor ? anchor.date : "",
      anchorSuspect: !!(anchor && anchor.suspect),
      points,
    };
  },

  // 缺定位：按猫归堆，只用于展示和补位置
  buildMissingGroups(photos) {
    const byCat = {};
    (photos || []).forEach((p) => {
      const cid = p.cat_id || "__unknown__";
      (byCat[cid] = byCat[cid] || []).push(p);
    });
    return Object.keys(byCat).map((cid) => {
      const cat = (this._catMap || {})[cid] || {};
      const list = byCat[cid].slice().sort((a, b) => {
        const da = String(a.shooting_date || "");
        const db = String(b.shooting_date || "");
        if (da !== db) return da < db ? 1 : -1;
        return String(a._id) < String(b._id) ? 1 : -1;
      });
      return {
        cat_id: cid,
        cat_name: cat.name || (cid === "__unknown__" ? "未关联猫猫" : "（猫猫已删除）"),
        orphan: cid === "__unknown__" || !cat.name,
        subtitle: [cat.campus, cat.area].filter(Boolean).join(" · ") || "未填常驻地",
        total: list.length,
        points: list.map((p) => ({
          _id: p._id,
          photo_id: p.photo_id || "",
          thumb: this.registerThumb(p),
          thumbBad: false,
          date: String(p.shooting_date || "") || "（未填日期）",
          photographer: p.photographer || "",
        })),
      };
    }).sort((a, b) => {
      if (!!a.orphan !== !!b.orphan) return a.orphan ? 1 : -1;
      return String(a.cat_name).localeCompare(String(b.cat_name), "zh");
    });
  },

  // ==================== 渲染 ====================

  applyGroups() {
    const groups = this.jsData.groups || [];
    let suspect = 0;
    let photos = 0;
    groups.forEach((g) => {
      suspect += g.suspectCount;
      photos += g.total;
    });

    let sorted = groups.slice().sort((a, b) => {
      if (!!a.orphan !== !!b.orphan) return a.orphan ? 1 : -1;   // 猫已删除/未关联压到最后
      if (b.suspectCount !== a.suspectCount) return b.suspectCount - a.suspectCount;
      return String(a.cat_name).localeCompare(String(b.cat_name), "zh");
    });

    // 搜猫名：只在当前视图里过滤，统计数字保持全量
    const kw = (this.data.keyword || "").trim().toLowerCase();
    const searching = !!kw;
    if (searching) {
      sorted = sorted.filter((g) =>
        String(g.cat_name).toLowerCase().indexOf(kw) >= 0 ||
        String(g.subtitle).toLowerCase().indexOf(kw) >= 0
      );
    }

    // 搜索时不再套「只看可疑」：想找一只猫却被页签挡住、结果空白，很像搜错了
    let viewGroups = sorted;
    if (this.data.mode === "suspect" && !searching) {
      viewGroups = sorted
        .filter((g) => g.suspectCount > 0)
        // 只看可疑时保留锚点，方便判断「这张就是决定地图位置的那张」
        .map((g) => Object.assign({}, g, { points: g.points.filter((p) => p.suspect || p.isAnchor) }));
    }

    // 「全部」或搜索可能一次渲染上千条，按条数截断
    let renderTruncated = false;
    if (this.data.mode === "all" || searching) {
      let count = 0;
      const capped = [];
      for (let i = 0; i < viewGroups.length; i++) {
        if (count >= RENDER_CAP) {
          renderTruncated = true;
          break;
        }
        capped.push(viewGroups[i]);
        count += viewGroups[i].points.length;
      }
      viewGroups = capped;
    }

    const missingGroups = this.jsData.missingGroups || [];
    let missing = 0;
    missingGroups.forEach((g) => { missing += g.total; });

    // 缺定位页签同样吃搜索词，否则在这里搜会像失灵
    const viewMissing = searching
      ? missingGroups.filter((g) =>
          String(g.cat_name).toLowerCase().indexOf(kw) >= 0 ||
          String(g.subtitle).toLowerCase().indexOf(kw) >= 0
        )
      : missingGroups;

    this.setData({
      viewGroups,
      missingGroups: viewMissing,
      stat: {
        cats: groups.length,
        photos,
        suspect,
        missing,
      },
      renderTruncated,
    });

    // 记录 id → 对象，缩略图加载失败时能直接改到那条
    this._pointById = {};
    [viewGroups, viewMissing].forEach((list) => {
      (list || []).forEach((g) => {
        (g.points || []).forEach((p) => { this._pointById[p._id] = p; });
      });
    });

    this.scheduleSignThumbs();
  },

  // ==================== 缩略图签名 ====================

  // 等首屏 setData 落地再签，别抢渲染时间
  scheduleSignThumbs() {
    if (this._signTimer || this._signing) return;
    this._signTimer = setTimeout(() => {
      this._signTimer = null;
      this.signThumbs();
    }, 80);
  },

  // 待签队列走全量（含还没显示的页签），切页签时就不用再等一轮出现空框
  collectUnsigned() {
    const out = [];
    const seen = {};
    const scan = (groups) => {
      (groups || []).forEach((g) => {
        (g.points || []).forEach((p) => {
          if (seen[p._id]) return;
          if (p.thumb || p.thumbBad) return;
          if (this._thumbBad[p._id]) return;
          const raw = this._thumbRaw[p._id];
          if (!raw || !/^https?:/i.test(raw)) return;
          seen[p._id] = 1;
          out.push({ id: p._id, raw, point: p });
        });
      });
    };
    scan(this.jsData.groups);
    scan(this.jsData.missingGroups);
    return out;
  },

  // 把刚签到的地址贴回当前页面：按 data 里的真实位置算路径，不会错行
  flushThumbs(signed) {
    if (this._unloaded) return;
    let patch = null;
    const scan = (name) => {
      (this.data[name] || []).forEach((g, gi) => {
        (g.points || []).forEach((p, pi) => {
          const hit = signed[p._id];
          if (hit == null) return;
          patch = patch || {};
          const base = name + "[" + gi + "].points[" + pi + "]";
          if (hit === "") {
            p.thumbBad = true;
            patch[base + ".thumbBad"] = true;
          } else {
            p.thumb = hit;
            patch[base + ".thumb"] = hit;
          }
        });
      });
    };
    scan("viewGroups");
    scan("missingGroups");
    if (patch) this.setData(patch);
  },

  // 分批签，签一批贴一批：1000 张也不会卡在「全部空白」然后突然刷出来
  async signThumbs() {
    if (this._signing) return;
    this._signing = true;
    try {
      for (;;) {
        if (this._unloaded) break;
        const batch = this.collectUnsigned().slice(0, SIGN_BATCH);
        if (!batch.length) break;
        const urls = await Promise.all(batch.map((it) => this.signOne(it.raw)));
        const signed = {};
        batch.forEach((it, i) => {
          const url = urls[i];
          if (!url) {
            // 签不出来（图已删 / 密钥过期 / 不是 COS 图）：标死，否则 while 会一直捞它
            this._thumbBad[it.id] = true;
            it.point.thumbBad = true;
            signed[it.id] = "";
            return;
          }
          signed[it.id] = url;
          // 直接写回对象：还没显示的点下次 applyGroups 就带着地址出来
          it.point.thumb = url;
        });
        this.flushThumbs(signed);
      }
    } finally {
      this._signing = false;
    }
    // 队列跑到一半时数据被刷新（下拉 / 补完位置重载），收尾时再补一轮
    if (!this._unloaded && this.collectUnsigned().length) this.scheduleSignThumbs();
  },

  async signOne(raw) {
    try {
      const url = await signCosUrl(raw);
      if (!url) return "";
      // 私有桶却没签出签名参数（COS SDK 没就绪 / 凭证过期）→ 这张必然还是 403，
      // 直接按打不开处理，别让视图层拿着一个注定失败的地址反复请求
      if (
        config.use_private_tencent_cos &&
        /^https?:/i.test(url) &&
        url.indexOf("myqcloud.com") >= 0 &&
        url.indexOf("q-signature") < 0
      ) {
        console.warn("[signOne] - 未签出签名参数:", raw);
        return "";
      }
      return url;
    } catch (e) {
      console.warn("[signOne] - 缩略图签名失败:", e);
      return "";
    }
  },

  // 签过还是打不开（图被删、桶权限变了）：标死，别无限重签
  onThumbError(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    console.warn("[onThumbError] - 缩略图加载失败:", id, this._thumbRaw[id]);
    this._thumbBad[id] = true;
    const p = this._pointById[id];
    if (p && !p.thumbBad) {
      p.thumbBad = true;
      this.applyGroups();
    }
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.mode) return;
    this.setData({ mode });
    this.applyGroups();
  },

  // 搜索猫名 / 常驻地，输入时防抖
  onKeywordInput(e) {
    const v = e.detail.value;
    this.setData({ keywordInput: v });
    clearTimeout(this._kwTimer);
    this._kwTimer = setTimeout(() => {
      this.setData({ keyword: v });
      this.applyGroups();
    }, 250);
  },

  clearKeyword() {
    clearTimeout(this._kwTimer);
    this.setData({ keyword: "", keywordInput: "" });
    this.applyGroups();
  },

  // 点缩略图看大图：判断「这张到底该不该在这个位置」全靠它
  async previewPhoto(e) {
    const { src, id } = e.currentTarget.dataset;
    // 缩略图还没签完就点了：现签一次，别让用户看到「没有图片地址」
    let url = src;
    if (!url && id) url = await this.signOne(this._thumbRaw[id] || "");
    if (!url) {
      wx.showToast({ title: "这张没有图片地址", icon: "none" });
      return;
    }
    wx.previewImage({ current: url, urls: [url] });
  },

  // 修改成功后重建这只猫的分组（坐标变了，中心、离群判定都要重算）
  refreshCat(catId) {
    this.jsData.photos = (this.jsData.photos || []).filter((p) => this.hasLocation(p));
    const photos = this.jsData.photos.filter((p) => (p.cat_id || "__unknown__") === catId);
    const groups = this.jsData.groups || [];
    const idx = groups.findIndex((g) => g.cat_id === catId);
    if (!photos.length) {
      if (idx >= 0) groups.splice(idx, 1);
    } else {
      const g = this.buildGroup(catId, photos);
      if (idx >= 0) groups[idx] = g;
      else groups.push(g);
    }
    this.applyGroups();
  },

  // ==================== 操作 ====================

  async updatePhoto(item_id, data) {
    const res = await api.curdOp({
      operation: "update",
      collection: "photo",
      item_id,
      data,
    });
    if (res && res.ok === false) {
      throw new Error(res.errMsg || "update failed");
    }
  },

  // 清除定位：这张不再参与地图，猫的位置退回上一张带定位的照片
  async clearLocation(e) {
    const { id, cat } = e.currentTarget.dataset;
    const res = await wx.showModal({
      title: "清除定位",
      content: "清除后这张照片不再参与喵地图，猫的位置会退回上一张带定位的照片。",
      confirmText: "清除",
      confirmColor: "#ff383c",
    });
    if (!res.confirm) return;

    wx.showLoading({ title: "保存中...", mask: true });
    try {
      await this.updatePhoto(id, { latitude: null, longitude: null });
      // 清完就从「有定位」挪到「缺定位」：它还是已过审照片，只是不再参与地图
      const photos = this.jsData.photos || [];
      const moved = photos.filter((x) => x._id === id)[0] || null;
      if (moved) {
        moved.latitude = null;
        moved.longitude = null;
      }
      wx.hideLoading();
      this.refreshCat(cat);
      if (moved && moved.photo_id) {
        this.jsData.missingPhotos = (this.jsData.missingPhotos || []).concat([moved]);
        this.jsData.missingGroups = this.buildMissingGroups(this.jsData.missingPhotos);
        this.applyGroups();
      }
      wx.showToast({ title: "已清除定位", icon: "success" });
    } catch (err) {
      wx.hideLoading();
      console.error("[clearLocation] - 失败:", err);
      wx.showToast({ title: "清除失败，请重试", icon: "none" });
    }
  },

  // 修正位置：打开页内选点浮层（与 addPhoto 同一套交互，不另起页面）
  // 浮层默认落在两个地方之一：这张照片现有坐标 → 这只猫其它照片的中心 → 配置的地图中心
  fixLocation(e) {
    const { id, cat, lat, lng, from } = e.currentTarget.dataset;
    const nLat = this.toNum(lat);
    const nLng = this.toNum(lng);
    let center = this.isCoordOk(nLat, nLng) ? { latitude: nLat, longitude: nLng } : null;
    if (!center) center = this.catMedianCenter(cat);
    if (!center) center = config.map_center || { latitude: 23.1026, longitude: 113.2996 };

    this._fixTarget = { id, cat, from };
    this._mapPickerSession = (this._mapPickerSession || 0) + 1;
    this._mapPickerCenter = { latitude: center.latitude, longitude: center.longitude };
    this._mapPickerScale = 17;
    this.setData({
      mapPickerVisible: true,
      mapPickerConfirming: false,
      pageMetaStyle: "overflow: hidden;",
      mapPickerInitLat: center.latitude,
      mapPickerInitLng: center.longitude,
      mapPickerScale: 17,
    });
  },

  // 这只猫现有照片的中位中心，没有可用的点就返回 null
  catMedianCenter(catId) {
    const group = (this.jsData.groups || []).filter((g) => g.cat_id === catId)[0];
    if (!group) return null;
    const valid = (group.points || []).filter((p) => this.isCoordOk(p.raw_lat, p.raw_lng));
    if (!valid.length) return null;
    return {
      latitude: this.median(valid.map((p) => p.raw_lat)),
      longitude: this.median(valid.map((p) => p.raw_lng)),
    };
  },

  // 手势结束后只在实例上记中心，不回写绑定属性：
  // 改动 map 任一绑定属性都会让地图跳回绑定的经纬度，拖动就被弹回去
  onMapRegionChange(e) {
    if (e.type !== "end" || e.causedBy === "update") return;
    const { centerLocation, scale } = e.detail || {};
    if (centerLocation) {
      this._mapPickerCenter = {
        latitude: centerLocation.latitude,
        longitude: centerLocation.longitude,
      };
    }
    if (scale !== undefined) this._mapPickerScale = scale;
  },

  async confirmMapPicker() {
    const target = this._fixTarget;
    if (!this.data.mapPickerVisible || this.data.mapPickerConfirming) return;
    if (!target) {
      this.cancelMapPicker();
      return;
    }
    const session = this._mapPickerSession;
    this.setData({ mapPickerConfirming: true });
    try {
      const center = await new Promise((resolve, reject) => {
        wx.createMapContext("photoLocationPicker", this).getCenterLocation({
          success: resolve,
          fail: reject,
        });
      });
      if (this._mapPickerSession !== session) return;
      this.setData({ mapPickerVisible: false, pageMetaStyle: "" });
      await this.applyFix(target.id, target.cat, {
        latitude: center.latitude,
        longitude: center.longitude,
      }, { from: target.from });
    } catch (err) {
      console.warn("[confirmMapPicker] - 读取地图中心失败:", err);
      if (this._mapPickerSession === session) {
        wx.showToast({ title: "无法读取地图位置，请重试", icon: "none" });
      }
    } finally {
      if (this._mapPickerSession === session) {
        this.setData({ mapPickerConfirming: false });
      }
    }
  },

  cancelMapPicker() {
    this._fixTarget = null;
    // 递增 session：浮层关闭后，迟到的 getCenterLocation 回调不再回填
    this._mapPickerSession = (this._mapPickerSession || 0) + 1;
    this.setData({ mapPickerVisible: false, mapPickerConfirming: false, pageMetaStyle: "" });
  },

  // 缩放时把当前中心一起写回，地图不会跳回打开时的位置
  zoomMap(delta) {
    const session = this._mapPickerSession;
    wx.createMapContext("photoLocationPicker", this).getCenterLocation({
      success: (res) => {
        if (!this.data.mapPickerVisible || this._mapPickerSession !== session) return;
        const current = this._mapPickerScale || this.data.mapPickerScale;
        const target = Math.max(3, Math.min(20, Math.round(current) + delta));
        this._mapPickerScale = target;
        this._mapPickerCenter = { latitude: res.latitude, longitude: res.longitude };
        // 目标级别可能恰好等于绑定值，值不变 setData 不会通知地图，微调一点让它生效
        const bound = Math.abs(target - this.data.mapPickerScale) < 0.0005
          ? target + 0.001
          : target;
        this.setData({
          mapPickerInitLat: res.latitude,
          mapPickerInitLng: res.longitude,
          mapPickerScale: bound,
        });
      },
    });
  },

  zoomMapIn() {
    this.zoomMap(1);
  },

  zoomMapOut() {
    this.zoomMap(-1);
  },

  // 一键归位：把它拉到这只猫其它点的中心。手抖点歪几十米时比手拖快得多
  async snapToCenter(e) {
    const { id, cat } = e.currentTarget.dataset;
    const group = (this.jsData.groups || []).filter((g) => g.cat_id === cat)[0];
    if (!group) return;
    const others = (group.points || []).filter(
      (p) => p._id !== id && this.isCoordOk(p.raw_lat, p.raw_lng)
    );
    if (!others.length) {
      wx.showToast({ title: "这只猫没有其它点可参照", icon: "none" });
      return;
    }
    const target = {
      latitude: this.median(others.map((p) => p.raw_lat)),
      longitude: this.median(others.map((p) => p.raw_lng)),
    };
    const cur = (group.points || []).filter((p) => p._id === id)[0];
    const d = cur && this.isCoordOk(cur.raw_lat, cur.raw_lng)
      ? distanceMeters(cur.raw_lat, cur.raw_lng, target.latitude, target.longitude)
      : NaN;

    const res = await wx.showModal({
      title: "移到多数点",
      content:
        "移到这只猫其它 " + others.length + " 张照片的中心" +
        (isFinite(d) ? "（移动约 " + fmtMeters(d) + "）" : "") +
        "。\n" + target.latitude.toFixed(6) + ", " + target.longitude.toFixed(6),
      confirmText: "移动",
    });
    if (!res.confirm) return;
    await this.applyFix(id, cat, target, {});
  },

  async applyFix(id, catId, loc, opts) {
    const from = opts && opts.from;
    wx.showLoading({ title: "保存中...", mask: true });
    try {
      await this.updatePhoto(id, { latitude: loc.latitude, longitude: loc.longitude });
      wx.hideLoading();

      if (from === "missing") {
        // 补上坐标后会从「缺定位」转到「有定位」，重新分组最稳
        await this.loadData();
      } else {
        const p = (this.jsData.photos || []).find((x) => x._id === id);
        if (p) {
          p.latitude = loc.latitude;
          p.longitude = loc.longitude;
        }
        this.refreshCat(catId);
      }
      wx.showToast({ title: "已更新位置", icon: "success" });
    } catch (err) {
      wx.hideLoading();
      console.error("[applyFix] - 失败:", err);
      wx.showToast({ title: "保存失败，请重试", icon: "none" });
    }
  },
});
