// pages/debug/meowid/meowid.js
// MeowID 识猫服务管理控制台（仅管理员可见）
//
// 存在原因：catFace 云函数的所有管理类 action（enrollBatch / bind / diagnose 等）
// 都要求"真实的微信登录会话 + user.manager >= 99"，EMAS 控制台的匿名测试调用会被拒绝。
// 所以这些操作必须有一个管理员登录的小程序入口，否则建档永远跑不起来，
// 识别结果会一直停留在"检测到猫但身份未确认"。
// 门槛与「页面配置」一致：Level-99（本页含密钥与第三方计费配置）
import api from "../../../utils/cloudApi";
import { checkAuth } from "../../../utils/user";
import { getGlobalSettings } from "../../../utils/page";
import { signCosUrl } from "../../../utils/common";

// 建档的单批次时间预算由云函数统一控制（MEOWID_ENROLL_DEADLINE_SEC，默认 40s、上限 50s），
// 前端不自己估算并发数：`enrollBatch` 逼近截止会主动停下并如实返回「剩下的下一批继续」，
// 所以不需要 ENROLL_SAFE_LIMIT 这类硬限制。

Page({
  data: {
    auth: false,
    isManager: false,
    loading: false,
    enrollLimit: 1,
    diagLimit: 1,
    testQuota: 1,
    catId: '',
    meowId: '',
    // MeowID 配置表单：填完直接写进 EMAS 的 app_secret，不用改代码重新发版
    cfgProjectId: '',
    cfgApiKey: '',
    cfgTopK: 5,
    cfgFreePerDay: 3,
    // 建档：只用精选照片 + 每只几张 + 单批次时间预算（秒，上限 50）
    cfgEnrollOnlyBest: true,
    cfgEnrollImages: 3,
    cfgEnrollDeadline: 40,
    // 广告奖励：看广告领识别次数
    cfgAdEnabled: false,
    cfgAdBonus: 2,
    cfgAdBonusMax: 3,
    cfgStatus: null,
    result: '',
    // 批量建档后的人话摘要（比原始 JSON 好读，重点是「为什么没传上」）
    enrollSummary: '',
    // 补传注册图（已建档的猫）：张数留空 = 跟随 ① 卡的「每只几张」配置，不静默覆盖
    enrollPerCat: '',
    enrollCatHint: '',
    // 识猫页设置（setting 集合 pages 文档的 recognize / ads 组），
    // 与 MeowID 配置（app_secret）不同源，所以单独一卡分开保存
    pageCfg: {
      showBtn: false,    // 首页是否显示识猫按钮
      secretKey: '',     // 识猫接口签名秘钥，可选
      bannerAd: '',      // 识猫页 banner 广告位
      videoAd: '',       // 激励视频广告位（看广告领次数用）
    },
  },

  async onShow() {
    // 与「页面配置」同一门槛：只有管理员 Level-99 能进入。
    // checkAuth 会顺带写入 auth / tipText，未达等级时页面显示无权限提示。
    let isManager = false;
    try {
      isManager = await checkAuth(this, 99);
    } catch (e) {
      console.warn('meowid: checkAuth failed', e);
    }
    this.setData({ isManager });
    if (!isManager) return;
    // 识猫页设置读取失败不影响本页其他功能
    this.loadPageCfg();
  },

  // ===== 识猫页设置：整合原本散在「页面配置」里的识猫项 =====
  async loadPageCfg() {
    try {
      const s = (await getGlobalSettings(null, { nocache: true })) || {};
      const rec = s.recognize || {};
      const ads = s.ads || {};
      this.setData({
        pageCfg: {
          showBtn: rec.showRecognizeBtn === true,
          secretKey: rec.secretKey || '',
          bannerAd: ads.recognize_banner || '',
          videoAd: ads.recognize_video || '',
        },
      });
    } catch (e) {
      console.log('meowid: loadPageCfg failed', e);
    }
  },

  pageCfgInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`pageCfg.${field}`]: e.detail.value,
    });
  },

  onToggleShowBtn(e) {
    this.setData({ 'pageCfg.showBtn': !!e.detail.value });
  },

  // 保存识猫页设置：先读完整 pages 文档，只合并 recognize / ads 两组整体 $set，
  // 不碰 tabBarCtrl 等其他组；$set 是局部更新，不会覆盖 setting.pages 的其他字段
  async onSavePageCfg() {
    let s = {};
    try {
      s = (await getGlobalSettings(null, { nocache: true })) || {};
    } catch (e) {
      console.log('meowid: read settings failed', e);
    }
    const recognize = Object.assign({}, s.recognize || {}, {
      showRecognizeBtn: this.data.pageCfg.showBtn,
      secretKey: String(this.data.pageCfg.secretKey || '').trim(),
    });
    const ads = Object.assign({}, s.ads || {}, {
      recognize_banner: String(this.data.pageCfg.bannerAd || '').trim(),
      recognize_video: String(this.data.pageCfg.videoAd || '').trim(),
    });
    wx.showLoading({ title: '保存中...', mask: true });
    try {
      const res = await api.curdOp({
        operation: 'update',
        collection: 'setting',
        item_id: 'pages',
        data: { recognize, ads },
      });
      wx.hideLoading();
      if (res && res.ok) {
        wx.showToast({ title: '已保存，立即生效', icon: 'success' });
        await this.loadPageCfg();
      } else {
        wx.showToast({ icon: 'none', title: '保存失败，请重试' });
      }
    } catch (e) {
      console.log('meowid: savePageCfg failed', e);
      wx.hideLoading();
      wx.showToast({ icon: 'none', title: '保存失败，请重试' });
    }
  },

  // 统一调用入口：所有 action 都走 catFace 云函数
  async call(action, extra, tip) {
    if (this.data.loading) return;
    if (!this.data.isManager) {
      wx.showToast({ icon: 'none', title: '仅管理员可操作' });
      return;
    }
    this.setData({ loading: true, result: '' });
    wx.showLoading({ title: tip || '处理中...', mask: true });
    try {
      const res = await api.catFace(Object.assign({ action }, extra || {}));
      this.setData({ result: JSON.stringify(res, null, 2) });
      wx.hideLoading();
      if (!res || res.ok === false) {
        const msg = (res && res.msg) || (res && res.code) || '未知错误';
        wx.showToast({ icon: 'none', title: String(msg).slice(0, 30), duration: 2500 });
      } else {
        wx.showToast({ icon: 'none', title: '完成' });
      }
      return res;
    } catch (e) {
      console.log('meowid call error:', action, e);
      wx.hideLoading();
      // 把 EMAS 的报错翻译成能照做的提示，不再只说"网络或服务异常"
      const ex = this.explainCallError(e);
      this.setData({ result: '调用失败：\n' + ex.full });
      wx.showToast({ icon: 'none', title: ex.short, duration: 3000 });
      // 返回结构化的失败结果，让建档摘要块也能显示真实原因
      return { ok: false, code: (e && e.code) || 'error', msg: ex.full };
    } finally {
      this.setData({ loading: false });
    }
  },

  // 云函数调用报错的"人话翻译"
  explainCallError(e) {
    const code = e && e.code;
    const raw = (e && e.message) || '';
    if (code === 'FunctionTimeout') {
      return {
        short: '云函数超时',
        full: '云函数运行超时，被平台强制终止（FunctionTimeout）。请依次检查：'
          + '\n1. 是否已上传最新版 catFace.zip（旧版内部预算超过平台 60s 上限，会被强杀）；'
          + '\n2. EMAS 控制台 catFace 的「函数超时时间」是否 ≥ 120 秒；'
          + '\n3. 若仍复现，把「每次数量」调小为 1 再试。'
          + '\n\n原始错误：' + raw,
      };
    }
    if (code) {
      return { short: String(code).slice(0, 20), full: '调用失败 ' + code + '：' + raw };
    }
    return { short: '网络或服务异常', full: raw || '网络或服务异常，请稍后重试' };
  },

  // ===== MeowID 配置：填完直接同步到 EMAS 的 app_secret =====
  // 走云函数的 saveConfig action：只认白名单字段（不含 OSS_* / MP_*），
  // 且要求管理员身份。app_secret 集合对客户端仍然完全禁读写，
  // 写入是云函数用服务端权限完成的，所以不存在"放开数据库权限"这回事。
  async onSaveConfig() {
    const data = {};
    const projectId = String(this.data.cfgProjectId || '').trim();
    const apiKey = String(this.data.cfgApiKey || '').trim();
    const topK = parseInt(this.data.cfgTopK, 10);
    const freePerDay = parseInt(this.data.cfgFreePerDay, 10);
    if (projectId) data.MEOWID_PROJECT_ID = projectId;
    if (apiKey) data.MEOWID_API_KEY = apiKey;
    if (topK > 0) data.MEOWID_TOP_K = Math.min(100, topK);
    if (freePerDay > 0) data.RECOGNIZE_FREE_PER_DAY = freePerDay;
    // 建档设置：只用精选照片（'1'/'0'）、每只几张、单批次时间预算
    data.MEOWID_ENROLL_ONLY_BEST = this.data.cfgEnrollOnlyBest ? '1' : '0';
    const enrollImages = parseInt(this.data.cfgEnrollImages, 10);
    const enrollDeadline = parseInt(this.data.cfgEnrollDeadline, 10);
    if (enrollImages > 0) data.MEOWID_ENROLL_IMAGES_PER_CAT = Math.min(6, enrollImages);
    if (enrollDeadline > 10) data.MEOWID_ENROLL_DEADLINE_SEC = Math.min(50, enrollDeadline);
    // 广告奖励：开关用 '1' / '' 表示，后端按字符串判断
    data.RECOGNIZE_AD_ENABLED = this.data.cfgAdEnabled ? '1' : '';
    const adBonus = parseInt(this.data.cfgAdBonus, 10);
    const adMax = parseInt(this.data.cfgAdBonusMax, 10);
    if (adBonus > 0) data.RECOGNIZE_AD_BONUS = adBonus;
    if (adMax > 0) data.RECOGNIZE_AD_BONUS_MAX_PER_DAY = adMax;
    if (!Object.keys(data).length) {
      wx.showToast({ icon: 'none', title: '至少填写一项再保存' });
      return;
    }
    const res = await this.call('saveConfig', { data }, '写入配置...');
    // 密钥不留在页面上
    this.setData({ cfgApiKey: '' });
    if (res && res.ok === true) {
      await this.onStatus();
    }
  },

  // 停用识猫：把项目和密钥清空，识别会返回 not_configured
  onDisableConfig() {
    wx.showModal({
      title: '确认停用',
      content: '将清空 MeowID 项目 ID 与 API Key，识别功能会提示"未配置"。已建档的个体不受影响。',
      success: (r) => {
        if (!r.confirm) return;
        this.call('saveConfig', {
          data: { MEOWID_PROJECT_ID: '', MEOWID_API_KEY: '' },
        }, '停用中...').then(() => this.onStatus());
      },
    });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  // 状态检查：确认配置项、COS、绑定情况，ping=true 时读取远端个体列表
  async onStatus() {
    const res = await this.call('status', { ping: true }, '检查配置...');
    // 只展示"是否已配置"这类布尔状态，后端不会回显密钥原文
    if (res && res.config) {
      this.setData({
        cfgStatus: res.config,
        cfgAdEnabled: !!res.config.adEnabled,
        cfgAdBonus: res.config.adBonus || 2,
        cfgAdBonusMax: res.config.adBonusMaxPerDay || 3,
        cfgFreePerDay: res.config.freePerDay || 3,
        // enrollOnlyBest 为 false 时说明库里明确写了 '0'
        cfgEnrollOnlyBest: res.config.enrollOnlyBest !== false,
        cfgEnrollImages: res.config.enrollImagesPerCat || 3,
        cfgEnrollDeadline: res.config.enrollDeadlineSec || 40,
      });
    }
    return res;
  },

  onToggleEnrollOnlyBest(e) {
    this.setData({ cfgEnrollOnlyBest: !!e.detail.value });
  },

  onToggleAd(e) {
    this.setData({ cfgAdEnabled: !!e.detail.value });
  },

  // 本人当日额度
  onQuota() {
    this.call('quota', {}, '查询额度...');
  },

  // 诊断：用一张登记图验证识别链路，会真实消耗第三方识别次数（可能收费）
  onDiagnose() {
    const limit = Math.min(10, Math.max(1, parseInt(this.data.diagLimit) || 1));
    wx.showModal({
      title: '确认诊断',
      content: `将使用 ${limit} 张登记图发起真实识别请求，可能产生第三方费用。继续？`,
      success: (r) => {
        if (r.confirm) this.call('diagnose', { limit }, '诊断中...');
      },
    });
  },

  // 批量建档：创建未绑定个体并上传注册照片（默认只传精选），耗时且收费
  onEnroll() {
    const limit = Math.min(10, Math.max(1, parseInt(this.data.enrollLimit) || 1));
    const onlyBest = this.data.cfgEnrollOnlyBest;
    const perCat = Math.max(1, parseInt(this.data.cfgEnrollImages, 10) || 3);
    let content = `将为 ${limit} 只未绑定的猫创建 MeowID 个体并上传注册图（每只最多 ${perCat} 张，${onlyBest ? '只用精选照片' : '所有过审照片'}），按量计费。`;
    content += `\n\n单批次有总预算限制，到点会停下并告知，剩下的下次继续。`;
    wx.showModal({
      title: '确认批量建档',
      content,
      success: (r) => {
        if (!r.confirm) return;
        this.setData({ enrollSummary: '' });
        this.call('enrollBatch', { limit }, '建档中，请耐心等待...').then((res) => {
          this.setData({ enrollSummary: this.buildEnrollSummary(res) });
        });
      },
    });
  },

  // 把 enrollBatch 的返回变成人话：每一只猫成没成、为什么没成、照片池有多少
  buildEnrollSummary(res) {
    if (!res || res.ok === false) {
      return '建档调用失败：' + ((res && res.msg) || '未知原因');
    }
    const lines = [];
    lines.push(`成功 ${res.done || 0} 只 · 失败 ${res.failed || 0} 只 · 共上传注册图 ${res.uploadedPhotos || 0} 张`);
    if (res.hint) lines.push('⚠️ ' + res.hint);
    for (const l of (res.logs || [])) {
      lines.push('');
      const who = l.name ? `${l.name}（${l.cat_id}）` : l.cat_id;
      lines.push(`${l.ok ? '✅' : '❌'} ${who}：${l.msg || (l.ok ? '完成' : '失败')}`);
      if (l.photos) {
        lines.push(`    照片池：过审 ${l.photos.verified} / 精选 ${l.photos.best} / 本次采用 ${l.photos.chosen}`);
      }
      if (l.errors && l.errors.length) {
        lines.push('    ' + l.errors[0].msg);
      }
    }
    return lines.join('\n');
  },

  // ===== 补传注册图（已建档 / 参考图不全的猫）=====
  // 云端 enrollCat 已存在的照片会自动跳过、不会重复建个体，所以这里可以放心重复点。
  // 先「预览」（dry_run，不花钱、不发请求）看清差异再执行，避免误扣费。
  async onEnrollCatPreview() {
    const cat_id = String(this.data.catId || '').trim();
    if (!cat_id) {
      wx.showToast({ icon: 'none', title: '请先填猫 ID' });
      return;
    }
    const typed = parseInt(this.data.enrollPerCat, 10);
    const extra = { cat_id, dry_run: true };
    if (typed > 0) extra.per_cat = Math.min(10, typed);
    const res = await this.call('enrollCat', extra, '计算待传差异...');
    const p = res && res.preview;
    if (!res || res.ok !== true || !p) {
      this.setData({ enrollCatHint: '预览失败：' + ((res && res.msg) || '未知原因') });
      return;
    }
    const lines = [];
    lines.push(`${p.name || p.cat_id}：可用 ${p.chosen} 张照片（过审 ${p.pool.verified} · 精选 ${p.pool.best}）`);
    lines.push(`已登记 ${p.alreadyRegistered} 张 · 本次待传 ${p.pending.length} 张${p.bound ? '' : '（尚未建档，执行时会先创建个体）'}`);
    if (res.hint) lines.push('⚠️ ' + res.hint);
    this.setData({ enrollCatHint: lines.join('\n') });
  },

  onEnrollCat() {
    const cat_id = String(this.data.catId || '').trim();
    if (!cat_id) {
      wx.showToast({ icon: 'none', title: '请先填猫 ID' });
      return;
    }
    // 留空 = 跟随配置（不传 per_cat）；填了才覆盖
    const typed = parseInt(this.data.enrollPerCat, 10);
    const per_cat = typed > 0 ? Math.min(10, typed) : 0;
    const extra = { cat_id };
    if (per_cat > 0) extra.per_cat = per_cat;
    const scope = per_cat > 0 ? `最多 ${per_cat} 张` : '按配置张数';
    wx.showModal({
      title: '确认补传注册图',
      content: `将为 ${cat_id} 补传注册图（${scope}，默认只用精选照片），已登记过的自动跳过，按量计费。`,
      success: (r) => {
        if (!r.confirm) return;
        this.setData({ enrollCatHint: '' });
        this.call('enrollCat', extra, '补传中...').then((res) => {
          this.setData({ enrollCatHint: this.buildEnrollCatSummary(res) });
        });
      },
    });
  },

  buildEnrollCatSummary(res) {
    if (!res || res.ok === undefined) {
      return '补传调用失败：' + ((res && res.msg) || '未知原因');
    }
    const log = res.log || {};
    const p = res.preview || {};
    const lines = [];
    lines.push(`${log.ok ? '✅ 完成' : '❌ 未完成'}：${p.name || p.cat_id || ''} 本次上传 ${res.uploadedPhotos || 0} 张，跳过 ${log.skipped || 0} 张`);
    if (p.pool) lines.push(`照片池：过审 ${p.pool.verified} · 精选 ${p.pool.best}`);
    if (log.msg) lines.push(log.msg);
    if (log.errors && log.errors.length) lines.push('失败原因：' + log.errors[0].msg);
    else if (res.hint && res.hint !== log.msg) lines.push('⚠️ ' + res.hint);
    return lines.join('\n');
  },

  // 同步远端任务状态（最新 100 个）
  onSyncTasks() {
    this.call('syncTasks', {}, '同步任务...');
  },

  // 绑定本地猫档案与远端个体
  onBind() {
    const cat_id = String(this.data.catId || '').trim();
    const meowid_id = String(this.data.meowId || '').trim();
    if (!cat_id || !meowid_id) {
      wx.showToast({ icon: 'none', title: '请填写猫 ID 和个体 ID' });
      return;
    }
    this.call('bind', { cat_id, meowid_id }, '绑定中...');
  },

  // 解除绑定：删除本地绑定和登记记录，保留远端个体
  onUnbind() {
    const cat_id = String(this.data.catId || '').trim();
    if (!cat_id) {
      wx.showToast({ icon: 'none', title: '请填写猫 ID' });
      return;
    }
    wx.showModal({
      title: '确认解绑',
      content: `将删除本地猫 ${cat_id} 的绑定与登记记录（远端个体保留）。继续？`,
      success: (r) => {
        if (r.confirm) this.call('unbind', { cat_id }, '解绑中...');
      },
    });
  },

  // 重试失败的建档任务：官方只接受 failed 且保留源数据的任务，成功返回 202
  onRetryTask() {
    const cat_id = String(this.data.catId || '').trim();
    const task_id = String(this.data.retryTaskId || '').trim();
    const limit = Math.min(30, Math.max(1, parseInt(this.data.retryLimit, 10) || 10));
    let content;
    if (task_id) {
      content = `将重试任务 ${task_id}。\n\n只有 failed 状态且保留源数据的任务可以重试。`;
    } else if (cat_id) {
      content = `将重试猫 ${cat_id} 名下所有失败任务，最多 ${limit} 个。`;
    } else {
      content = `将重试本地记录里全部失败任务，最多 ${limit} 个。\n\n建议先「同步建档任务」刷新状态再试。`;
    }
    wx.showModal({
      title: '确认重试',
      content,
      success: (r) => {
        if (r.confirm) this.call('retryTask', { cat_id, task_id, limit }, '重试中...');
      },
    });
  },

  // 查看某只猫的建档参考图：判断是不是照片质量拖累了识别
  async onViewImages() {
    const cat_id = String(this.data.catId || '').trim();
    if (!cat_id) {
      wx.showToast({ icon: 'none', title: '请填写本地猫 ID' });
      return;
    }
    const res = await this.call('catImages', { cat_id }, '读取参考图...');
    if (!res || res.ok === false) {
      this.setData({ refImages: null });
      return;
    }
    // 后端返回的是 COS 原始地址，私有桶必须签名后才能显示
    const local = [];
    for (const item of (res.local || [])) {
      let url = item.url || '';
      if (url) {
        try {
          url = await signCosUrl(url);
        } catch (e) {
          console.log('meowid: signCosUrl failed', e);
        }
      }
      local.push(Object.assign({}, item, { url }));
    }
    this.setData({ refImages: Object.assign({}, res, { local }) });
  },

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    const list = (this.data.refImages && this.data.refImages.local) || [];
    const urls = list.map((i) => i.url).filter(Boolean);
    wx.previewImage({ current: url, urls: urls.length ? urls : [url] });
  },

  // 给自己加测试额度，避免拿真实免费额度做调试
  onGrantTestQuota() {
    const n = Math.min(50, Math.max(1, parseInt(this.data.testQuota) || 1));
    this.call('grantTestQuota', { n }, '发放中...');
  },

  onCopyResult() {
    if (!this.data.result) return;
    wx.setClipboardData({
      data: this.data.result,
      success: () => wx.showToast({ icon: 'none', title: '已复制' }),
    });
  },

  onClearResult() {
    this.setData({ result: '' });
  },
});
