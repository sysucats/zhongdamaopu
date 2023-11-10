// 画图全局canvas，依赖版本库：2.24.7
import {compressImage, sleep} from "./utils";

// 初始化canvas接口
function initCanvas(canvasId) {
  return new Promise((resolve) => {
    console.log("initCanvas start");
    wx.createSelectorQuery()
    .select(canvasId) // 在 WXML 中填入的 id
    .fields({ node: true, size: true })
    .exec((res) => {
        console.log("initCanvas res", res);
        // Canvas 对象
        const canvas = res[0].node
        // Canvas 画布的实际绘制宽高
        const renderWidth = res[0].width
        const renderHeight = res[0].height
        // Canvas 绘制上下文
        const ctx = canvas.getContext('2d')

        // 初始化画布大小
        const dpr = wx.getWindowInfo().pixelRatio
        canvas.width = renderWidth * dpr
        canvas.height = renderHeight * dpr
        ctx.scale(dpr, dpr);

        resolve({
          canvas: canvas,
          ctx: ctx
        });
    })
  })
}

// 包装一个画图接口
function drawImage(gCtx, gCanvas, imgSrc, dx, dy, weight, height) {
  console.log("drawImage", gCtx, imgSrc);
  return new Promise((resolve) => {
    const image = gCanvas.createImage()
    image.onload = () => {
        // 清空画布
        gCtx.clearRect(0, 0, gCanvas.width, gCanvas.height)
        gCtx.drawImage(
            image,
            dx,
            dy,
            weight,
            height,
        )
        resolve();
    }
    image.src = imgSrc
  })
}

// 获得temp文件路径
async function getTempPath(gCtx, gCanvas, options) {
  let maxTry = 5;  // 重试5次
  let res = undefined;
  while (maxTry > 0 && res === undefined) {
    await sleep(200);  // 保证画图完成
    options.canvas = gCanvas;
    var tempFilePath = (await wx.canvasToTempFilePath(options)).tempFilePath;
    res = await compressImage(tempFilePath, 80);
    maxTry --;
  }
  return res;
}


// 写上水印
async function writeWatermake(gCtx, gCanvas, options) {
    // 写上水印
    gCtx.font = `normal ${options.fontSize}px sans-serif`;
    gCtx.fillStyle = options.fillStyle;
    gCtx.fillText(options.text, options.x, options.y);
}


module.exports = {
  initCanvas: initCanvas,
  drawImage: drawImage,
  getTempPath: getTempPath,
  writeWatermake: writeWatermake,
};
