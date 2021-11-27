# 关于构建

微信小程序现已[支持 npm 包](https://developers.weixin.qq.com/miniprogram/dev/devtools/npm.html)，因此初次构建时需要额外进行一些操作。

## 首次下载项目后

1. **安装依赖**

```shell
npm install
```

2. **生成小程序 npm**

   菜单栏依次选择：工具 - 构建 npm

3. **修改 crypto 模块**

   打开 `miniprogram/miniprogram_npm/sha256/index.js:8`，并将

   ```js
   var crypto = require('crypto');
   ```

   改为

   ```js
   var crypto = require('miniprogram-sm-crypto');
   ```

    
