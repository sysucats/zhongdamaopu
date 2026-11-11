function inside(x, y, contours) {
  let result = false;
  for (const loop of contours) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const [a, b] = loop[i], [c, d] = loop[j];
      if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) result = !result;
    }
  }
  return result;
}

// Use the intersection of all tier silhouettes, so their text shares one position and size.
function engravingArea(models) {
  const size = 64, mask = new Uint8Array(size * size), stride = size + 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    mask[y * size + x] = models.every(m => inside((x + .5) / size * m.width, (y + .5) / size * m.height, m.contours)) ? 1 : 0;
  }
  const prefix = new Uint32Array(stride * stride);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let valid = true;
    for (let dy = -2; dy <= 2 && valid; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (x + dx < 0 || x + dx >= size || y + dy < 0 || y + dy >= size || !mask[(y + dy) * size + x + dx]) { valid = false; break; }
    }
    const i = (y + 1) * stride + x + 1;
    prefix[i] = (valid ? 0 : 1) + prefix[i - 1] + prefix[i - stride] - prefix[i - stride - 1];
  }
  for (let w = 38; w >= 10; w--) {
    const h = Math.round(w / 2.3); let best = null, score = Infinity;
    for (let y = 0; y + h <= size; y++) for (let x = 0; x + w <= size; x++) {
      const bad = prefix[(y + h) * stride + x + w] - prefix[y * stride + x + w] - prefix[(y + h) * stride + x] + prefix[y * stride + x];
      const distance = Math.hypot(x + w / 2 - size / 2, y + h / 2 - size / 2);
      if (!bad && distance < score) { best = { x: x / size, y: y / size, w: w / size, h: h / size }; score = distance; }
    }
    if (best) return best;
  }
  throw new Error('徽章系列没有共同的安全刻字区域');
}

module.exports = { engravingArea };
