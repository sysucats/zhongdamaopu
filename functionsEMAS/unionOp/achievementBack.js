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

module.exports = { generateAssets, renderBack, objectKey, materialTextColor, pickTextColor };
