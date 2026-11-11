// Personal serials stay local: no per-owner image uploads or COS objects.
function canvas(width, height) { return wx.createOffscreenCanvas({ type: '2d', width, height }); }

async function createEngraving(THREE, badge, model, appName, area) {
  const scale = 1024 / Math.max(model.width, model.height);
  const width = Math.round(model.width * scale), pixels = Math.round(model.height * scale);
  const color = canvas(width, pixels), context = color.getContext('2d');
  const image = color.createImage();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = badge.backImage; });
  context.drawImage(image, 0, 0, width, pixels);
  const bump = canvas(width, pixels), roughness = canvas(width, pixels);
  const height = bump.getContext('2d'), matte = roughness.getContext('2d');
  height.fillStyle = '#dedede'; height.fillRect(0, 0, width, pixels);
  matte.fillStyle = '#929292'; matte.fillRect(0, 0, width, pixels);
  const safe = { x: area.x * width, y: area.y * pixels, w: area.w * width, h: area.h * pixels };
  const x = width - safe.x - safe.w / 2, y = safe.y + safe.h / 2;
  const lines = [[appName, Math.min(26 * scale, safe.w / 5.7), y - safe.h * .23], [badge.ownerName, Math.min(17 * scale, safe.w / 10), y + safe.h * .07]];
  if (badge.unlocked && badge.serialNo) lines.push(['NO. ' + String(badge.serialNo).padStart(6, '0'), Math.min(15 * scale, safe.w / 10), y + safe.h * .30]);
  for (const ctx of [context, height, matte]) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; }
  for (const [value, size, at] of lines) {
    if (!value) continue;
    for (const ctx of [context, height, matte]) ctx.font = `${size}px sans-serif`;
    context.fillStyle = 'rgba(45,35,20,.6)'; context.fillText(value, x, at, safe.w * .9);
    height.fillStyle = '#606060'; height.fillText(value, x, at, safe.w * .9);
    matte.fillStyle = '#eeeeee'; matte.fillText(value, x, at, safe.w * .9);
  }
  return { color: new THREE.CanvasTexture(color), bump: new THREE.CanvasTexture(bump), roughness: new THREE.CanvasTexture(roughness) };
}

module.exports = createEngraving;
