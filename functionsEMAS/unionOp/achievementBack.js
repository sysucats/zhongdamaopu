const COS = require('cos-nodejs-sdk-v5');
const { PNG } = require('pngjs');
const { createHash } = require('crypto');
const { createBadgeGeometry } = require('./achievementGeometry');

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 2048;

function objectKey(url, secret) {
  const parsed = new URL(url);
  const host = `${secret.OSS_BUCKET}.${secret.OSS_ENDPOINT}`;
  if (parsed.protocol !== 'https:' || parsed.hostname !== host || !parsed.pathname.startsWith('/achievement/')) {
    throw new Error('徽章素材必须位于当前 COS 的 achievement 目录');
  }
  const key = decodeURIComponent(parsed.pathname.slice(1));
  if (!key || key.includes('..') || !/\.png$/i.test(key)) throw new Error('只支持 PNG 徽章素材');
  return key;
}

function cosCall(cos, method, params) {
  return new Promise((resolve, reject) => cos[method](params, (error, data) => error ? reject(error) : resolve(data)));
}

function renderBack(frontBytes, materialBytes) {
  if (frontBytes.length > MAX_BYTES || materialBytes.length > MAX_BYTES) throw new Error('素材不得超过 5 MB');
  const front = PNG.sync.read(frontBytes);
  const material = PNG.sync.read(materialBytes);
  if (front.width > MAX_SIDE || front.height > MAX_SIDE || material.width > MAX_SIDE || material.height > MAX_SIDE) {
    throw new Error('素材宽高不得超过 2048 像素');
  }
  const back = new PNG({ width: front.width, height: front.height });
  const scale = Math.max(front.width / material.width, front.height / material.height);
  const sourceWidth = front.width / scale;
  const sourceHeight = front.height / scale;
  const offsetX = (material.width - sourceWidth) / 2;
  const offsetY = (material.height - sourceHeight) / 2;
  for (let y = 0; y < front.height; y++) {
    for (let x = 0; x < front.width; x++) {
      const sourceX = Math.min(material.width - 1, Math.floor(offsetX + x / scale));
      const sourceY = Math.min(material.height - 1, Math.floor(offsetY + y / scale));
      const source = (sourceY * material.width + sourceX) * 4;
      const target = (y * front.width + x) * 4;
      const mirrored = (y * front.width + front.width - 1 - x) * 4;
      back.data[target] = material.data[source];
      back.data[target + 1] = material.data[source + 1];
      back.data[target + 2] = material.data[source + 2];
      back.data[target + 3] = Math.round(front.data[mirrored + 3] * material.data[source + 3] / 255);
    }
  }
  return PNG.sync.write(back, { deflateLevel: 9 });
}

// 读取 COS 配置并建好客户端；徽章素材、材质图都存在当前 COS 的 achievement 目录
async function openCos(ctx) {
  const { result: secret } = await ctx.mpserverless.db.collection('app_secret').findOne();
  if (!secret?.OSS_BUCKET || !secret?.OSS_ENDPOINT || !secret?.OSS_SECRET_ID || !secret?.OSS_SECRET_KEY) {
    throw new Error('COS 配置不完整');
  }
  const region = secret.OSS_ENDPOINT.match(/^cos\.([^.]+)\.myqcloud\.com$/)?.[1];
  if (!region) throw new Error('COS 地域配置无效');
  const cos = new COS({ SecretId: secret.OSS_SECRET_ID, SecretKey: secret.OSS_SECRET_KEY });
  return { cos, secret, common: { Bucket: secret.OSS_BUCKET, Region: region } };
}

// 相对亮度与对白底的对比度（WCAG）
function luminance([r, g, b]) {
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const contrastOnWhite = rgb => 1.05 / (luminance(rgb) + 0.05);
const toHex = rgb => '#' + rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('');

// 材质的文字色：取中心一块（短边 30%）不透明像素的平均色，再按比例压暗到白底上对比度 ≥ 3，保证成就名称看得清
function pickTextColor(png) {
  const side = Math.max(1, Math.round(Math.min(png.width, png.height) * 0.3));
  const x0 = Math.floor((png.width - side) / 2);
  const y0 = Math.floor((png.height - side) / 2);
  const sum = [0, 0, 0];
  let count = 0;
  for (let y = y0; y < y0 + side; y++) {
    for (let x = x0; x < x0 + side; x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i + 3] < 200) continue;
      sum[0] += png.data[i]; sum[1] += png.data[i + 1]; sum[2] += png.data[i + 2];
      count++;
    }
  }
  let rgb = count ? sum.map(v => v / count) : [154, 165, 177];
  // 只降 HSL 亮度、保留色相和饱和度，避免金色压暗后发灰
  const [h, sat, light] = toHsl(rgb);
  for (let l = light; l > 0.1 && contrastOnWhite(rgb) < 3; l -= 0.02) rgb = fromHsl(h, sat, l);
  return toHex(rgb);
}

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map(v => (v + m) * 255);
}

async function materialTextColor(ctx, materialUrl) {
  const { cos, secret, common } = await openCos(ctx);
  const material = await cosCall(cos, 'getObject', { ...common, Key: objectKey(materialUrl, secret) });
  if (material.Body.length > MAX_BYTES) throw new Error('素材不得超过 5 MB');
  return pickTextColor(PNG.sync.read(material.Body));
}

async function generateAssets(ctx, frontUrl, materialUrl, badgeKey, report = async () => {}) {
  await report(0, '读取素材');
  const { cos, secret, common } = await openCos(ctx);
  const frontKey = objectKey(frontUrl, secret);
  const materialKey = objectKey(materialUrl, secret);
  const [front, material] = await Promise.all([
    cosCall(cos, 'getObject', { ...common, Key: frontKey }),
    cosCall(cos, 'getObject', { ...common, Key: materialKey }),
  ]);
  await report(1, '生成背面图');
  const png = renderBack(front.Body, material.Body);
  const digest = createHash('sha256').update(png).digest('hex').slice(0, 12);
  const backKey = `achievement/generated/${badgeKey}_${digest}_back.png`;
  await report(2, '生成 3D 轮廓');
  const geometry = createBadgeGeometry(PNG.sync.read(front.Body));
  const materialPng = PNG.sync.read(material.Body);
  const center = (Math.floor(materialPng.height / 2) * materialPng.width + Math.floor(materialPng.width / 2)) * 4;
  geometry.edgeColor = Array.from(materialPng.data.subarray(center, center + 3));
  const model = Buffer.from(JSON.stringify(geometry));
  const modelDigest = createHash('sha256').update(model).digest('hex').slice(0, 12);
  const modelKey = `achievement/generated/${badgeKey}_${modelDigest}_model-v1.json`;
  await report(3, '上传背面图');
  await cosCall(cos, 'putObject', {
    ...common, Key: backKey, Body: png, ContentType: 'image/png',
  });
  await report(4, '上传 3D 素材');
  await cosCall(cos, 'putObject', { ...common, Key: modelKey, Body: model, ContentType: 'application/json' });
  const origin = `https://${secret.OSS_BUCKET}.${secret.OSS_ENDPOINT}/`;
  return { backImage: origin + backKey, model3dUrl: origin + modelKey };
}

// ===== 清理 COS 上不再使用的徽章素材 =====
// 生成的文件名：achievement/generated/<徽章 key>_<12 位摘要>_back.png / _model-v1.json
const GENERATED_PREFIX = 'achievement/generated/';
const GENERATED_SUFFIX = /^[0-9a-f]{12}_(back\.png|model-v1\.json)$/;
// 重新生成后只删 10 分钟前的旧文件，避免误删并发生成刚上传、还没写入数据库的文件
const STALE_AGE_MS = 10 * 60 * 1000;

// URL → COS 对象 key（只认当前存储桶的 achievement 目录，用于比较，不限扩展名）
function assetKey(url, secret) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== `${secret.OSS_BUCKET}.${secret.OSS_ENDPOINT}`) return '';
    const key = decodeURIComponent(parsed.pathname.slice(1));
    return key.startsWith('achievement/') && !key.includes('..') ? key : '';
  } catch (error) {
    return '';
  }
}

// 从列表里挑出该徽章可删的生成文件：名字严格匹配（key 为 a 时不会误中 a_b 的文件）、不在保留集合、且足够旧
function staleGenerated(objects, badgeKey, keepKeys = [], { now = Date.now(), minAgeMs = 0 } = {}) {
  const prefix = `${GENERATED_PREFIX}${badgeKey}_`;
  const keep = new Set(keepKeys);
  return objects.filter(item => item.Key.startsWith(prefix)
    && GENERATED_SUFFIX.test(item.Key.slice(prefix.length))
    && !keep.has(item.Key)
    && now - Date.parse(item.LastModified) >= minAgeMs).map(item => item.Key);
}

async function listObjects(cos, common, prefix) {
  const objects = [];
  let marker = '';
  for (;;) {
    const data = await cosCall(cos, 'getBucket', { ...common, Prefix: prefix, Marker: marker, MaxKeys: 1000 });
    objects.push(...(data.Contents || []));
    if (data.IsTruncated !== 'true' || !data.NextMarker) return objects;
    marker = data.NextMarker;
  }
}

async function deleteObjects(cos, common, keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    await cosCall(cos, 'deleteMultipleObject', { ...common, Objects: keys.slice(i, i + 1000).map(Key => ({ Key })) });
  }
}

// 删除徽章的生成文件。keepUrls 为仍在使用的素材；stale 为 true 时只删旧文件（重新生成后用）
async function pruneGenerated(ctx, badgeKey, keepUrls = [], { stale = false } = {}) {
  const { cos, secret, common } = await openCos(ctx);
  const objects = await listObjects(cos, common, `${GENERATED_PREFIX}${badgeKey}_`);
  const keys = staleGenerated(objects, badgeKey, keepUrls.map(url => assetKey(url, secret)).filter(Boolean),
    { minAgeMs: stale ? STALE_AGE_MS : 0 });
  if (keys.length) await deleteObjects(cos, common, keys);
  return keys;
}

// 删除上传的正面图（只删 achievement/fronts 下的文件）
async function deleteFront(ctx, url) {
  const { cos, secret, common } = await openCos(ctx);
  const key = assetKey(url, secret);
  if (!key.startsWith('achievement/fronts/')) return false;
  await cosCall(cos, 'deleteObject', { ...common, Key: key });
  return true;
}

// ===== 全量扫描孤儿素材：没有任何徽章引用的正面图、背面图、轮廓 =====
const ORPHAN_PREFIXES = ['achievement/generated/', 'achievement/fronts/'];
// 只算 1 天前的文件：编辑页刚上传、还没保存的正面图暂时没有引用，不能当孤儿
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

function orphanAssets(objects, referencedKeys, { now = Date.now(), minAgeMs = ORPHAN_AGE_MS } = {}) {
  const referenced = new Set(referencedKeys);
  return objects.filter(item => ORPHAN_PREFIXES.some(prefix => item.Key.startsWith(prefix) && item.Key.length > prefix.length)
    && !item.Key.endsWith('/')
    && !referenced.has(item.Key)
    && now - Date.parse(item.LastModified) >= minAgeMs)
    .map(item => ({ key: item.Key, size: Number(item.Size) || 0 }));
}

// referencedUrls：所有徽章记录里的素材地址
async function scanOrphans(ctx, referencedUrls) {
  const { cos, secret, common } = await openCos(ctx);
  const lists = await Promise.all(ORPHAN_PREFIXES.map(prefix => listObjects(cos, common, prefix)));
  const referenced = referencedUrls.map(url => assetKey(url, secret)).filter(Boolean);
  return orphanAssets(lists.flat(), referenced);
}

async function deleteAssetKeys(ctx, keys) {
  const { cos, common } = await openCos(ctx);
  await deleteObjects(cos, common, keys);
}

module.exports = {
  generateAssets, renderBack, objectKey, materialTextColor, pickTextColor,
  pruneGenerated, deleteFront, staleGenerated, orphanAssets, scanOrphans, deleteAssetKeys,
};
