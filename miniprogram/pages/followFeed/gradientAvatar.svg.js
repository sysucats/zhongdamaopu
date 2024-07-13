export const gradientAvatarSvg = (color = '#ccc', dashArray = '0') => {
  // 在网站 https://colorkit.co/gradients/ 生成渐变色代码
  const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" class="gradientAvatar" width="170" height="170">
  <defs>
    <linearGradient id="gradient" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fd5" />
      <stop offset="10%" stop-color="#fd5" />
      <stop offset="50%" stop-color="#ff543e" />
      <stop offset="100%" stop-color="#c837ab" />
    </linearGradient>
  </defs>
  <circle cx="85" cy="85" r="82" fill="none" stroke="${color}" stroke-width="6" stroke-dasharray="${dashArray}" stroke-linecap="round"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgXml)}`;
};