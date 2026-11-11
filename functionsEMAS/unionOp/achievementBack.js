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

async function generateAssets(ctx, frontUrl, materialUrl, badgeKey, report = async () => {}) {
  await report(0, '读取素材');
  const { result: secret } = await ctx.mpserverless.db.collection('app_secret').findOne();
  if (!secret?.OSS_BUCKET || !secret?.OSS_ENDPOINT || !secret?.OSS_SECRET_ID || !secret?.OSS_SECRET_KEY) {
    throw new Error('COS 配置不完整');
  }
  const frontKey = objectKey(frontUrl, secret);
  const materialKey = objectKey(materialUrl, secret);
  const region = secret.OSS_ENDPOINT.match(/^cos\.([^.]+)\.myqcloud\.com$/)?.[1];
  if (!region) throw new Error('COS 地域配置无效');
  const cos = new COS({ SecretId: secret.OSS_SECRET_ID, SecretKey: secret.OSS_SECRET_KEY });
  const common = { Bucket: secret.OSS_BUCKET, Region: region };
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

module.exports = { generateAssets, renderBack, objectKey };
