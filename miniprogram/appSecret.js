// 修改双引号中的字符串，和APISIX的key-auth匹配
// 服务端参考文档：https://apisix.apache.org/zh/docs/apisix/plugins/key-auth/
// 默认是不启用的

module.exports = {
  apikey: "change-to-your-own-key"
};
