// getTempFilePath.js
module.exports = {
    name: 'getTempFilePath',

    handler (opts) {
        return new Promise((resolve, reject) => {
            const _opts = {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                destWidth: 0,
                destHeight: 0,
                ...opts
            }

            wx.canvasToTempFilePath({
                x: _opts.x,
                y: _opts.y,
                width: _opts.width,
                height: _opts.height,
                destWidth: this.xDpr(_opts.destWidth),
                destHeight: this.xDpr(_opts.destHeight),
                canvas: this.canvas,
                success: res => {
                    const tempFilePath = res.tempFilePath

                    resolve(tempFilePath)
                },
                fail: () => {
                    this.debugLogout('获取临时图片路径失败', 'error')
                    reject(Error('获取临时图片路径失败'))
                }
            })
        })
    }
}