// 修改双引号中的字符串，和APISIX的key-auth匹配
// 默认是不启用，私有部署laf才需要
// 修改后将文件名修改成 appSecret.js
// 服务端参考文档：https://apisix.apache.org/zh/docs/apisix/plugins/key-auth/

module.exports = {
  apikey: "change-to-your-own-key"
};
