# :pencil:中大猫谱

*——拍照记录校园内猫猫的成长轨迹* :cat::smiley_cat::heart_eyes_cat:

主要功能：创建校园猫猫档案，为猫猫上传照片，以及照片审核，人员管理等。

![简介大图](./readme/img1.png)

## 体验一下

打开微信，扫码或搜索“中大猫谱”。

<img src="./readme/qrcode1.png" width = "200" height = "200" alt="中大猫谱菊花码" />

## 朋友们的小程序

|<img src="./readme/qrcode2.png" width = "200" height = "200" alt="华农喵星人菊花码" />|<img src="./readme/qrcode3.png" width = "200" height = "200" alt="汇景猫党菊花码" />|<img src="./readme/qrcodeHNU.jpg" width = "200" height = "200" alt="HNU喵汪图鉴菊花码" />|
|:----:|:----:|:----:|
|华农喵星人|汇景猫党|HNU喵汪图鉴|
|<img src="./readme/qrcodeCMZJ.png" width = "200" height = "200" alt="财猫之家菊花码" />|<img src="./readme/qrcodeESMY.jpg" width = "200" height = "200" alt="二师猫语菊花码" />|
|财猫之家|二师猫语|

如果，你所在校园（/社团/小区...）的猫猫:smile_cat:也盼望拥有一份属于自己的猫猫档案，请你跟随下一章节的指引，为它们部署、发布一份独特的猫谱小程序。

部署完成后，可以邀请你的朋友帮忙管理猫猫信息。我们为此准备了【猫谱-管理员手册】，信息管理无需接触代码。链接：https://docs.qq.com/doc/DSEl0aENOSEx5cmtE

部署过程中遇到任何问题，可以：
* 加入猫谱技术交流微信群，点击查看群二维码：https://docs.qq.com/doc/DSFNQd1VVSG1CeG5T
* 加入猫谱技术交流QQ群：956808218
* 查看【猫谱-部署常见问题】文档（必看！），链接：https://docs.qq.com/doc/DSGFSU25jalpEZ2FO
* 发邮件至：dxzyfwd@163.com
* 在部署演示视频下留言，链接：https://www.bilibili.com/video/BV1Sb4y1W7gS/
* 在GitHub页面提issue

## 资料整理
|资料名|类型|链接|
|:----:|:----:|:----:|
|部署视频|视频|https://www.bilibili.com/video/BV1Sb4y1W7gS|
|猫谱-部署常见问题|文档|https://docs.qq.com/doc/DSGFSU25jalpEZ2FO|
|猫谱-管理员手册|文档|https://docs.qq.com/doc/DSEl0aENOSEx5cmtE|
|猫谱-升级代码|文档|https://docs.qq.com/doc/DSExBY2RsUHlOYlpj|
|imProcess云函数环境|压缩包|https://wwz.lanzout.com/iefHj01u0ddi|
|imProcess云函数部署（不需要了）|视频|https://www.bilibili.com/video/BV1zA411W7Rn|

# :scroll:部署

:smirk_cat:*无需从零开始，只要一些耐心。*

请参考wiki内容：[wiki](https://github.com/sysucats/zhongdamaopu/wiki)



# :game_die:设置项说明

在数据库的`setting`表中，控制着一部分页面表现，可以随时修改并在小程序端展现。

## pages

主要设置各个页面的元素展示。

|设置项|子设置项|描述|
|:----|:----|:----|
|checkFeedback|step|反馈处理页每次加载数量|
|detailCat|albumStep|猫猫相册每次加载数量|
|    |cantUpload|关闭上传功能的版本号|
|    |galleryCompressed|相册大图是否使用压缩图|
|    |galleryPreload|相册大图预加载的数量|
|    |manageUpload|上传功能强制给管理员开启|
|    |photoStep|猫猫精选图每次加载的数量|
|genealogy|adStep|广告出现的间隔|
|    |catsStep|首页每次加载猫猫的数量|
|    |main_lower_threshold|首页触底加载的像素值|
|    |photoPopWeight|每张猫猫照片增加的人气值|

## filter

主要用于猫猫信息修改，及首页过滤器。

|设置项|描述|
|:----|:----|
|area|区域（请使用小程序端修改）|
|campuses|校区（谨慎修改）|
|colour|花色（请使用小程序端修改）|

## friendLink

用于设置友情链接，请参考样例进行添加。

|设置项|描述|
|:----|:----|
|appid|小程序的APPID|
|logo|小程序的图标，可以使用云存储FileID|
|name|小程序的名称|

## subscribeMsg

用于管理员订阅的数量设置。

|设置项|子设置项|描述|
|:----|:----|:----|
|chkFeedback|receiverNum|最多推送给几位管理员（暂未生效）|
|verifyPhoto|receiverNum|最多推送给几位管理员|
|    |triggerNum|触发推送的待审核数量|

# :notebook_with_decorative_cover:管理员手册

管理员使用时，请参考此共享文档：【猫谱-管理员手册】https://docs.qq.com/doc/DSEl0aENOSEx5cmtE ，可以发给其他管理员查阅。

# :dancers:开发团队

本项目的开发工作100%用爱发电:sparkles:，特别感谢每一位为此付出的小伙伴。

:computer:代码开发：渔政、XD、zJ、yw

:black_nib:UI设计：蓝卷、zJ、yw

:notebook:资料整理：笃行志愿服务队及各校区小伙伴

如果你有新的想法或建议，非常欢迎你在issue板块发起讨论或者提交代码PR。

# :ferris_wheel:开源协议

本项目遵循MPL-2.0开源协议。在此基础上，如果你发布了一份新的猫谱，我们希望你能保留中大猫谱的友情链接。待你的线上版本稳定使用一段时间后，请留言告诉我们将你的友链加到中大猫谱小程序中。

