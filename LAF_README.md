# 部署流程
1. 导入laf应用打包
2. 用upload_laf_db上传数据集
3. 创建app_secret的内容
4. mp.weixin.qq.com上配置request、uploadFile域名

# Laf 1.0部署流程
1. 创建数据表(ok)
2. 创建访问策略(ok)
3. 创建触发器(ok)
4. 测试腾讯云接入(ok)
5. 猫谱logo不要用腾讯云，会被签名导致打开不了(ok)

# laf 1.0 cli使用
1. laf login -r https://laf.run laf_xxxx
2. laf app list
3. laf app init xxxxxx
4. laf func push
5. laf dep push
6. 重启laf后台
7. 运行部署指引，创建数据库
8. laf policy push