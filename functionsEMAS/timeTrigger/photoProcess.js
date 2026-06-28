// 照片处理定时任务（v1.3 升级版）
// 在 EMAS Linux 环境下批量处理 photo_compressed 为空的已审核照片：
//   1) 下载原图（COS 私有桶走 signCosUrlIfNeeded 拿 2h 签名）
//   2) jimp 生成压缩图 + 水印图（opentype.js + svg2png-wasm 双字体路由）
//   3) unionOp.getURL 走 minio presignedPost 上传到 /compressed + /watermark/<uuid>.jpg
//   4) 直接写库回填 photo_compressed / photo_watermark + cat_id
// 60s 超时限制：剩余 < 10s 时不再启动新相片，等下一次定时触发继续。
// 字符级字体路由：emoji 走 NotoEmoji-VariableFont_wght.ttf，文字走 font.ttf
// （替代 jimp 0.22 的 .fnt bitmap 字体，open-sans 不含中文/emoji）

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
// 重型依赖（jimp / opentype / svg2png-wasm / cos）延后到"有照片要处理时"再 require
// 节省空闲时的常驻内存（timeTrigger 每 5 分钟触发一次，90% 时间是空闲）

const CANVAS_MAX = 1200;            // 画布最长边（与前端一致）
const COMPRESS_LENGTH = 500;        // 压缩图最长边（与前端一致）
const JPEG_QUALITY = 80;            // 对应前端 compressImage(80)
const WATERMARK_FONT_RATIO = 0.03;  // 水印字号 = 缩放后画布高 * 0.03
const WATERMARK_MARGIN = 30;        // 水印左下偏移
const BATCH_SIZE = 10;             // 单次最多处理的照片数，避免超时
const HTTP_TIMEOUT_MS = 30000;      // 下载/上传超时
const SIGN_EXPIRES_SECONDS = 2 * 60 * 60; // 与前端 sign_expires_tencent_cos 一致

// 整个云函数 60s 超时限制下，剩余时间不足 10s 时不再启动新相片
const TOTAL_BUDGET_MS = 60000;
const REMAINING_THRESHOLD_MS = 10000;

// 字体
const TTF_FONT_PATH = path.join(__dirname, 'fonts', 'font.ttf');
const EMOJI_TTF_FONT_PATH = path.join(__dirname, 'fonts', 'NotoEmoji-VariableFont_wght.ttf');
const SVG2PNG_WASM_PATH = path.join(__dirname, 'node_modules', 'svg2png-wasm', 'svg2png_wasm_bg.wasm');

// emoji 字符判定：U+1F000-U+1F2FF / U+1F300-U+1FAFF / U+2600-U+27BF + ZWJ
const EMOJI_RE = /[\u{1F000}-\u{1F2FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u200D]/u;

// ---- 单例：opentype font + svg2png-wasm + cos 客户端全局只初始化一次 ----
let _Jimp = null;
let _axios = null;
let _FormData = null;
let _COS = null;
let _opentype = null;
let _createSvg2pngWasm = null;
let _svg2pngInit = null;
let _font = null;
let _svg2png = null;
let _fontFamilyMain = null;
let _fontFamilyEmoji = null;
let _cos = null;
let _heavyLoaded = false;

// 首次处理照片时才加载重型依赖，节省空闲时内存
function loadHeavyDeps() {
  if (_heavyLoaded) return;
  _Jimp = require('jimp');
  _axios = require('axios');
  _FormData = require('form-data');
  _COS = require('cos-nodejs-sdk-v5');
  _opentype = require('opentype.js');
  const svg2pngMod = require('svg2png-wasm');
  _createSvg2pngWasm = svg2pngMod.createSvg2png;
  _svg2pngInit = svg2pngMod.initialize;
  _heavyLoaded = true;
  console.log('[photoProcess] heavy deps loaded');
}

async function ensureRenderReady() {
  if (_font && _svg2png) return;
  loadHeavyDeps();
  if (!fs.existsSync(TTF_FONT_PATH)) {
    throw new Error('字体文件不存在: ' + TTF_FONT_PATH);
  }
  if (!fs.existsSync(SVG2PNG_WASM_PATH)) {
    throw new Error('svg2png-wasm 文件不存在: ' + SVG2PNG_WASM_PATH);
  }
  _font = _opentype.parse(fs.readFileSync(TTF_FONT_PATH));
  await _svg2pngInit(fs.readFileSync(SVG2PNG_WASM_PATH));
  const fontBuffers = [fs.readFileSync(TTF_FONT_PATH)];
  if (fs.existsSync(EMOJI_TTF_FONT_PATH)) {
    fontBuffers.push(fs.readFileSync(EMOJI_TTF_FONT_PATH));
  } else {
    console.warn('[photoProcess] 未发现 emoji 字体，将全部走主字体:', EMOJI_TTF_FONT_PATH);
  }
  _svg2png = _createSvg2pngWasm({ fonts: fontBuffers });
  const fams = _svg2png.getLoadedFontFamilies();
  _fontFamilyMain = fams[0];
  _fontFamilyEmoji = fams[1] || fams[0];
  console.log('[photoProcess] render ready, font families:', fams, 'main=', _fontFamilyMain, 'emoji=', _fontFamilyEmoji);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// 把字符串渲染成 Jimp 图像（白字透明背景），emoji 自动走 NotoEmoji 字体
async function renderTextToJimp(text, fontSize) {
  if (!text) return new _Jimp(1, 1, 0x00000000);

  const fontSizeInt = Math.max(8, Math.round(fontSize));
  const yBaseline = Math.round(fontSizeInt * 0.8);

  // 按字符切 runs：连续同字体的字符合并
  const runs = [];
  let curFont = null, curText = '';
  function flush() { if (curText) runs.push({ font: curFont, text: curText }); curText = ''; }
  for (const ch of text) {
    const wantFont = EMOJI_RE.test(ch) ? _fontFamilyEmoji : _fontFamilyMain;
    if (curFont && wantFont !== curFont) flush();
    curFont = wantFont; curText += ch;
  }
  flush();

  const tspans = runs.map(r =>
    '<tspan font-family="' + r.font + '">' + escapeXml(r.text) + '</tspan>'
  ).join('');

  const tempSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="200">'
    + '<text x="0" y="' + yBaseline + '" font-size="' + fontSizeInt + '" fill="#fff">'
    + tspans
    + '</text></svg>';
  const tempPng = await _svg2png(tempSvg, { width: 4000, height: 200, backgroundColor: 'transparent' });
  const tempImg = await _Jimp.read(Buffer.from(tempPng));

  // alpha bbox 裁剪
  const w = tempImg.bitmap.width, h = tempImg.bitmap.height;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = tempImg.bitmap.data[(y * w + x) * 4 + 3];
    if (a > 0) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) return new _Jimp(1, fontSizeInt, 0x00000000);
  const pad = 2;
  return tempImg.clone().crop(
    Math.max(0, minX - pad),
    Math.max(0, minY - pad),
    Math.min(w, maxX + 1 + pad) - Math.max(0, minX - pad),
    Math.min(h, maxY + 1 + pad) - Math.max(0, minY - pad)
  );
}

module.exports = async (ctx) => {
  const baseTime = Date.now();
  const phaseLog = (msg, extra) => {
    if (extra !== undefined) {
      console.log(`[photoProcess] ${msg}`, extra);
    } else {
      console.log(`[photoProcess] ${msg}`);
    }
  };
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - baseTime);

  // 1) app_name（与前端 config.text.app_name 等价）
  const appName = await loadAppName(ctx);
  phaseLog('appName =', appName);

  // 2) 查找待处理照片：photo_compressed 为空 + verified=true
  const { result: photos } = await ctx.mpserverless.db.collection('photo').find({
    photo_compressed: { $in: [undefined, ''] },
    verified: true
  }, {
    projection: {
      _id: 1,
      _openid: 1,
      photo_id: 1,
      photographer: 1,
      userInfo: 1,
      cat_id: 1,
    },
    limit: BATCH_SIZE
  });

  // 没有待处理照片 → 直接 return，**不加载任何重型依赖**（省内存）
  if (!photos || photos.length === 0) {
    phaseLog('no pending photos, skip heavy deps');
    return { processed: 0 };
  }

  // 3) 字体/wasm 初始化（首次 ~1s，懒加载 jimp/cos/opentype/svg2png-wasm）
  await ensureRenderReady();

  // 4) 补全水印所需 userInfo
  await fillUserInfo(ctx, photos);
  phaseLog(`pending photos: ${photos.length}, remaining=${remaining()}ms`);

  const results = [];
  const perPhotoTimings = [];
  let stopReason = null;

  for (let i = 0; i < photos.length; i++) {
    const left = remaining();
    if (left < REMAINING_THRESHOLD_MS) {
      stopReason = 'time_budget_exceeded';
      phaseLog(`stop: remaining ${left}ms < ${REMAINING_THRESHOLD_MS}ms threshold at ${i}/${photos.length}`);
      break;
    }

    const photo = photos[i];
    const photoStart = Date.now();
    try {
      const res = await processOne(ctx, photo, appName);
      const elapsed = Date.now() - photoStart;
      perPhotoTimings.push({ _id: photo._id, elapsed_ms: elapsed });
      results.push({ _id: photo._id, ok: true, elapsed_ms: elapsed, ...res });
    } catch (error) {
      const elapsed = Date.now() - photoStart;
      perPhotoTimings.push({ _id: photo._id, elapsed_ms: elapsed, ok: false });
      phaseLog(`processOne failed for ${photo._id} after ${elapsed}ms`, error && error.message);
      results.push({
        _id: photo._id,
        ok: false,
        elapsed_ms: elapsed,
        error: (error && error.message) || String(error)
      });
    }
    phaseLog(`progress ${i + 1}/${photos.length}, remaining=${remaining()}ms`);
  }

  const okCount = results.filter(r => r.ok).length;
  const failedCount = results.length - okCount;
  const unprocessed = photos.length - results.length;
  const totalElapsed = Date.now() - baseTime;

  const summary = {
    processed: results.length,
    ok: okCount,
    failed: failedCount,
    unprocessed,
    total_elapsed_ms: totalElapsed,
    remaining_ms: remaining(),
    results
  };
  if (stopReason) summary.stop_reason = stopReason;
  if (perPhotoTimings.length) summary.per_photo_timings = perPhotoTimings;

  return summary;
};

// 读取 setting/pages 里的 app_name
async function loadAppName(ctx) {
  try {
    const { result } = await ctx.mpserverless.db.collection('setting').findOne({
      _id: 'pages'
    });
    return (result && result.app_name) || '笃行猫谱';
  } catch (e) {
    console.warn('[photoProcess] loadAppName failed, fallback', e && e.message);
    return '笃行猫谱';
  }
}

// 与前端 fillUserInfo 行为等价：openid → userInfo
async function fillUserInfo(ctx, photos) {
  const openids = [];
  for (const p of photos) {
    if (!p.userInfo && p._openid) {
      openids.push(p._openid);
    }
  }
  if (openids.length === 0) return;

  const { result: users } = await ctx.mpserverless.db.collection('user').find({
    openid: { $in: openids }
  }, {
    projection: { openid: 1, userInfo: 1 }
  });
  const map = {};
  for (const u of (users || [])) {
    map[u.openid] = u.userInfo;
  }
  for (const p of photos) {
    if (!p.userInfo && p._openid) {
      p.userInfo = map[p._openid] || { nickName: '猫友' };
    }
  }
}

// 处理单张照片（含 COS 私有桶签名 + 双字体水印）
async function processOne(ctx, photo, appName) {
  if (!photo.photo_id) {
    throw new Error('photo_id 缺失');
  }

  // 1) 下载原图（私有桶先签名）
  const readableUrl = await signCosUrlIfNeeded(ctx, photo.photo_id);
  const original = await _Jimp.read(readableUrl);
  const width = original.bitmap.width;
  const height = original.bitmap.height;

  // 2) 压缩图
  const compressed = original.clone();
  if (width >= height) {
    compressed.resize(COMPRESS_LENGTH, _Jimp.AUTO);
  } else {
    compressed.resize(_Jimp.AUTO, COMPRESS_LENGTH);
  }
  compressed.quality(JPEG_QUALITY);
  const compressedBuffer = await compressed.getBufferAsync(_Jimp.MIME_JPEG);

  // 3) 水印图
  const watermarked = original.clone();
  const scale = Math.max(width, height) / CANVAS_MAX;
  const drawWidth = Math.max(1, Math.floor(width / Math.max(scale, 1)));
  const drawHeight = Math.max(1, Math.floor(height / Math.max(scale, 1)));
  if (scale > 1) {
    watermarked.resize(drawWidth, drawHeight);
  }

  const photographer = (photo.photographer && photo.photographer.trim())
    || (photo.userInfo && photo.userInfo.nickName)
    || '猫友';
  const watermarkText = `${appName}@${photographer}`;
  const fontSize = Math.max(12, Math.floor(drawHeight * WATERMARK_FONT_RATIO));
  try {
    const textImg = await renderTextToJimp(watermarkText, fontSize);
    if (textImg.bitmap.width > 1 && textImg.bitmap.height > 1) {
      const w = textImg.bitmap.width;
      const h = textImg.bitmap.height;
      const wmX = WATERMARK_MARGIN;
      const wmY = Math.max(0, drawHeight - h - WATERMARK_MARGIN / 2);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const maskIdx = (y * w + x) * 4;
          const a = textImg.bitmap.data[maskIdx + 3];
          if (a > 128) {
            const bx = wmX + x;
            const by = wmY + y;
            if (bx >= 0 && bx < watermarked.bitmap.width && by >= 0 && by < watermarked.bitmap.height) {
              const baseIdx = (by * watermarked.bitmap.width + bx) * 4;
              watermarked.bitmap.data[baseIdx] = 255;
              watermarked.bitmap.data[baseIdx + 1] = 255;
              watermarked.bitmap.data[baseIdx + 2] = 255;
              watermarked.bitmap.data[baseIdx + 3] = 255;
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[photoProcess] watermark render failed, skip', e && e.message);
  }
  watermarked.quality(JPEG_QUALITY);
  const watermarkBuffer = await watermarked.getBufferAsync(_Jimp.MIME_JPEG);

  // 4) 上传
  const uuid = generateUUID();
  const compressedName = `/compressed/${uuid}.jpg`;
  const watermarkName = `/watermark/${uuid}.jpg`;
  const compressedUpload = await uploadBuffer(ctx, compressedBuffer, compressedName);
  const watermarkUpload = await uploadBuffer(ctx, watermarkBuffer, watermarkName);

  // 5) 回写数据库
  await ctx.mpserverless.db.collection('photo').updateOne({
    _id: photo._id
  }, {
    $set: {
      photo_compressed: compressedUpload.fileUrl,
      photo_compressed_id: compressedUpload.fileId,
      photo_watermark: watermarkUpload.fileUrl,
      photo_watermark_id: watermarkUpload.fileId,
    }
  });

  return {
    compressed: compressedUpload.fileUrl,
    watermark: watermarkUpload.fileUrl,
    cat_id: photo.cat_id || ''
  };
}

// COS 私有桶签名（与 photoProcessTest.js 等价）
async function signCosUrlIfNeeded(ctx, url) {
  const parsed = parseCosUrl(url);
  if (!parsed) return url;

  if (!_cos) {
    loadHeavyDeps(); // ensure cos SDK is loaded
    const { result: app_secret } = await ctx.mpserverless.db.collection('app_secret').findOne();
    if (!app_secret || !app_secret.OSS_SECRET_ID || !app_secret.OSS_SECRET_KEY) {
      throw new Error('app_secret 缺少 OSS_SECRET_ID / OSS_SECRET_KEY');
    }
    _cos = new _COS({
      SecretId: app_secret.OSS_SECRET_ID,
      SecretKey: app_secret.OSS_SECRET_KEY,
    });
  }

  return new Promise((resolve, reject) => {
    _cos.getObjectUrl({
      Bucket: parsed.bucket,
      Region: parsed.region,
      Key: parsed.key,
      Method: 'GET',
      Expires: SIGN_EXPIRES_SECONDS,
    }, (err, data) => {
      if (err) {
        console.error('[photoProcess] signCosUrl failed', err);
        return reject(err);
      }
      resolve(data && data.Url ? data.Url : url);
    });
  });
}

function parseCosUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('myqcloud.com')) return null;
  const m = url.match(/^https?:\/\/([^.]+)\.cos\.([^.]+)\.myqcloud\.com\/(.+?)(?:\?.*)?$/);
  if (!m) return null;
  return { bucket: m[1], region: m[2], key: decodeURIComponent(m[3]) };
}

// 走 unionOp 的 getURL 拿 minio 预签名 post 凭证，再上传 buffer
async function uploadBuffer(ctx, buffer, cloudPath) {
  loadHeavyDeps(); // ensure axios/form-data loaded
  const presign = await ctx.mpserverless.function.invoke('unionOp', {
    fileName: cloudPath,
    unionAction: 'getURL'
  });
  const data = presign && (presign.result || presign);
  if (!data || !data.postURL || !data.formData) {
    throw new Error('getURL 返回结构异常: ' + JSON.stringify(data).slice(0, 200));
  }

  const form = new _FormData();
  for (const key of Object.keys(data.formData)) {
    form.append(key, data.formData[key]);
  }
  form.append('file', buffer, {
    filename: cloudPath.replace(/^\//, ''),
    contentType: 'image/jpeg'
  });

  const resp = await _axios.post(data.postURL, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });

  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`upload http ${resp.status}: ${String(resp.data).slice(0, 200)}`);
  }

  const cleanKey = data.formData.key.startsWith('/')
    ? data.formData.key.slice(1)
    : data.formData.key;
  return {
    fileUrl: data.postURL + cleanKey,
    fileId: ''
  };
}

function generateUUID() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x7) | 0x8;
        return v.toString(16);
      });
}
