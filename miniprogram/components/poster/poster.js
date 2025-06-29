// wx-canvas-2d - 2.0 使用文档 https://kiccer.github.io/wx-canvas-2d/
import {
    WxCanvas2d,
    Text,
    Image,
    Rect,
    SaveToAlbum,
    Debugger
} from "wx-canvas-2d";
import getTempFilePath from './extends/getTempFilePath';
import config from "../../config";
import { getUserInfo } from "../../utils/user";
import { generateMpCode } from "../../utils/mpcode";
import { signCosUrl } from "../../utils/common";

WxCanvas2d.use(SaveToAlbum)
WxCanvas2d.use(Debugger)
WxCanvas2d.use(getTempFilePath)
const canvas = new WxCanvas2d()

Component({
    /**
     * 组件的属性列表
     */
    properties: {
        cat: {
            type: Object,
            value: null,
            observer(newVal, oldVal) {
                if (oldVal && oldVal !== newVal) {
                    wx.removeStorageSync(`poster_${oldVal.id}_${this.data.coverImg?._id}`);
                }
            }
        },
        coverImg: {
            type: Object,
            value: null,
            // 监听coverImg，换了一张图片就要清除之前的缓存
            observer(newVal, oldVal) {
                if (oldVal && oldVal._id !== newVal._id) {
                    wx.removeStorageSync(`poster_${this.data.cat?.id}_${oldVal._id}`);
                }
            }
        },
        adopt_desc: {
            type: Object,
            value: config.cat_status_adopt
        },
        text_cfg: {
            type: Object,
            value: config.text
        },
    },

    /**
     * 组件的初始数据
     */
    data: {
        posterWidth: 650,       // 与poster.wxss中的canvas宽度一致
        posterHeight: 1000,     // 与poster.wxss中的canvas高度一致
        primaryColor: '#ffd101', // 主色调, 可与app.wxss中的--color-primary保持一致
        fontColor: '#fff'       // tag字体颜色 #222
    },

    lifetimes: {
        async attached() {
            // 在组件实例进入页面节点树时执行
            canvas.debugger = true // open debugger

            // 加载自定义字体 wx-canvas-2d默认为'sans-serif'
            // wx.loadFontFace({
            //     family: 'TencentSans',
            //     source: 'url("https://h5app.qq.com/act/TEG/tencent_font_switch_w7w3/fonts/TencentSans-W3.woff2")',
            //     scopes: ['webview', 'native'],
            //     success: (res) => {
            //         canvas.fontFamily = 'TencentSans'
            //     },
            //     fail: (res) => {
            //         console.log(res)
            //     },
            //     complete: (res) => {
            //         console.log(res.status)
            //     }
            // })

            // 创建画布
            setTimeout(() => {
                canvas.create({
                    query: '.poster-canvas', // 必传，canvas元素的查询条件
                    rootWidth: 750, // 参考设备宽度 (即开发时UI设计稿的宽度，默认375，可改为750)
                    bgColor: '#fff', // 背景色，默认透明
                    component: this, // 自定义组件内需要传 this
                    radius: 20 // 海报图圆角，如果不需要可不填
                })
            }, 200)
        },

        detached() {
            // 在组件实例被从页面节点树移除时执行
        }
    },

    /**
     * 组件的方法列表
     */
    methods: {
        // 开始生成海报
        async startDrawing() {
            // 先检查平台, 似乎只支持安卓和ios，开发者工具也可以，其余平台未能正常绘制，没定位到原因
            const { platform } = await wx.getSystemInfo();
            if (!['ios', 'devtools', 'android'].includes(platform)) {
                await wx.showModal({
                    title: '暂不支持此平台',
                    content: '请到手机端体验~(^・ω・^ )',
                    mask: true,
                    showCancel: false,
                    confirmColor: '#222',
                });
                return false;
            }
            if (!this.properties.cat) return;

            wx.showLoading({ title: '生成ing...', mask: true });

            const { cat, coverImg } = this.properties;
            console.log('Cat:', cat);

            // 检查缓存
            if (this.checkCache(cat.id, coverImg._id)) {
                wx.hideLoading();
                return;
            }
            // 先有码
            await generateMpCode(cat);
            // 配置和尺寸
            const drawingConfig = await this.drawingConfig(cat);

            // 开始绘制
            this.executeDrawing(drawingConfig)
                .then(() => this.saveAndShareImage(cat.id, coverImg._id))
                .catch(err => {
                    wx.showToast({ title: '生成失败(×﹏×)', icon: 'error' });
                    console.error(err);
                });
        },

        // 检查缓存
        checkCache(catId, coverId) {
            // 检查缓存中是否有海报图片路径
            const cachedPosterPath = wx.getStorageSync(`poster_${catId}_${coverId}`);
            if (cachedPosterPath) {
                wx.showShareImageMenu({
                    path: cachedPosterPath,
                    success: () => {
                        wx.showToast({ title: '搞定(^・ω・^ )', icon: 'success' });
                    },
                    fail: (err) => {
                        console.log(err);
                    }
                });
                return true;
            }
            return false;
        },
        // 测量文本宽度
        measureTextWidth(text, fontSize, fontWeight = '', fontFamily = canvas.fontFamily) {
            const originalFont = canvas.ctx.font; // 保存原始字体样式
            canvas.ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`; // 设置新的字体样式

            const width = canvas.ctx.measureText(text).width; // 测量文本宽度
            canvas.ctx.font = originalFont; // 恢复原始字体样式

            return width;
        },

        // 海报配置
        async drawingConfig(cat) {
            // 海报配置
            const { text_cfg, coverImg } = this.properties;
            if (coverImg && !coverImg.userInfo) {
                coverImg.userInfo = (await getUserInfo(coverImg._openid)).userInfo;
            }
            // 领养状态 未知 时，显示 持续流浪中
            const adopt_desc = (cat.adopt === undefined || cat.adopt === null) ? "持续流浪中" : this.properties.adopt_desc[cat.adopt];
            const sterilized = cat.sterilized ? text_cfg.detail_cat.sterilized_true : text_cfg.detail_cat.sterilized_false;
            const to_star = text_cfg.genealogy.to_star_tip;

            // photoPopWeight如何获取？
            const photoPopWeight = 10;
            const popularityScore = cat.popularity + (cat.photo_count_total ? cat.photo_count_total * photoPopWeight : 0);

            const photographer = text_cfg.genealogy.photo_by_tip + (coverImg.photographer || (coverImg.userInfo ? coverImg.userInfo.nickName : text_cfg.genealogy.photo_by_unknow_tip));

            // 有关尺寸
            const coverHeight = 600;    // 封面高度
            const coverWidth = 600;     // 封面宽度
            const tagBgHeight = 30;     // 标签背景高度
            // 字体大小
            const name = 40;            // 名字
            const name_width = 450;     // 名字最大宽度
            const title = 28;           // app
            const desc = 20;            // solgan、摄影师
            const tag = 16;             // 标签
            const lineHeight_n = 8;     // 行间距

            // 测量文字宽度
            const adoptDescWidth = this.measureTextWidth(adopt_desc, tag);
            const sterilizedWidth = this.measureTextWidth(sterilized, tag);
            const popularityScoreWidth = this.measureTextWidth(popularityScore, desc);
            const to_starWidth = this.measureTextWidth(to_star, tag);
            // 标签padding
            const tagPadding = 7.5;

            return {
                text_cfg,
                coverImg,
                popularityScore,
                adopt_desc,
                sterilized,
                to_star,
                photographer,
                coverHeight,
                coverWidth,
                tagBgHeight,
                name,
                name_width,
                title,
                desc,
                tag,
                lineHeight_n,
                adoptDescWidth,
                sterilizedWidth,
                to_starWidth,
                popularityScoreWidth,
                tagPadding
            };
        },

        // 执行绘制
        async executeDrawing(config) {
            const { text_cfg, coverImg, popularityScore, adopt_desc, sterilized, to_star, photographer, coverHeight, coverWidth, tagBgHeight, name, name_width, title, desc, tag, lineHeight_n, adoptDescWidth, sterilizedWidth, to_starWidth, popularityScoreWidth, tagPadding } = config;
            const { cat } = this.properties;
            // 标签的初始位置
            let tagX = 50;

            // 如果有性别，调整标签的位置
            if (cat.gender) {
                tagX += 50;
            }

            // 绘制海报
            const series = [
                // 大图
                {
                    type: Image,
                    url: '/pages/public/images/card/poster_bg.png',
                    x: 0,
                    y: 0,
                    width: 650,
                    height: 1000,
                    mode: 'aspectFill',
                    zIndex: 999
                }, {
                    type: Image,
                    url: coverImg.photo_compressed || coverImg.photo_id,
                    x: 25,
                    y: 25,
                    width: coverWidth,
                    height: coverHeight,
                    mode: 'aspectFill'
                },
                // 摄影师
                {
                    type: Rect,
                    x: 25,
                    y: 595,
                    width: coverWidth,
                    height: 30,
                    bgColor: 'rgba(34, 34, 34, 0.4)'
                }, {
                    type: Text,
                    text: photographer,
                    x: 25,
                    y: 595,
                    fontSize: desc,
                    width: coverWidth,     // 名字最大宽度
                    ellipsis: 1,    // 超出部分显示省略号
                    lineHeight: 30,
                    align: 'center',
                    color: 'rgba(255, 255, 255, 0.4)'
                },
                // 猫猫信息
                {
                    type: Text,
                    text: cat.name,
                    flag: 'name',
                    x: 50,
                    y: 640,
                    fontSize: name,
                    lineHeight: name * 1.6,
                    width: name_width,
                    ellipsis: 1,    // 超出部分显示省略号
                    color: '#222',
                    fontWeight: 'bold'
                }, {
                    type: Image,
                    url: '/pages/public/images/card/card/pop.png',
                    x: this.data.posterWidth - tagPadding * 2 - popularityScoreWidth - 85,
                    y: 657,
                    height: 20,
                    width: 35,
                    mode: 'aspectFit'
                }, {
                    type: Text,
                    text: popularityScore,
                    x: 0 - tagPadding,
                    y: 657.5,
                    width: coverWidth,
                    lineHeight: desc,
                    align: 'right',
                    fontSize: desc,
                    color: '#222'
                },
                // 判断性别是否有记录,没有的话此时wx-canvas-2d debugger会报错，但不影响使用
                cat.gender ? {
                    type: Image,
                    url: cat.gender === '公' ? '/pages/public/images/card/card/male.png'
                        : cat.gender === '母' ? '/pages/public/images/card/card/female.png'
                            : '/pages/public/images/card/card/cat.png',
                    x: 50,
                    y: 705,
                    width: 30,
                    height: 30
                } : null,
                // 领养 & 绝育 & 喵星的标签
                {
                    type: Rect,
                    x: tagX,
                    y: 705,
                    width: adoptDescWidth + tagPadding * 2,
                    height: tagBgHeight,
                    bgColor: this.data.primaryColor,
                    radius: tagBgHeight / 2
                }, {
                    type: Text,
                    text: adopt_desc,
                    x: tagX,
                    y: 705 + tag / 2,
                    width: adoptDescWidth + tagPadding * 2,
                    fontSize: tag,
                    ellipsis: 1,
                    align: 'center',
                    fontWeight: 'bold',
                    color: this.data.fontColor
                }, {
                    type: Rect,
                    x: tagX + 10 + adoptDescWidth + tagPadding * 2,
                    y: 705,
                    width: sterilizedWidth + tagPadding * 2,
                    height: tagBgHeight,
                    bgColor: this.data.primaryColor,
                    radius: tagBgHeight / 2
                }, {
                    type: Text,
                    text: sterilized,
                    x: tagX + 10 + adoptDescWidth + tagPadding * 2,
                    y: 705 + tag / 2,
                    width: sterilizedWidth + tagPadding * 2,
                    fontSize: tag,
                    ellipsis: 1,
                    align: 'center',
                    fontWeight: 'bold',
                    color: this.data.fontColor
                },
                cat.to_star ? {
                    type: Rect,
                    x: tagX + 20 + sterilizedWidth + tagPadding * 2 + adoptDescWidth + tagPadding * 2,
                    y: 705,
                    width: to_starWidth + tagPadding * 2,
                    height: tagBgHeight,
                    bgColor: '#888',
                    radius: tagBgHeight / 2
                } : null,
                cat.to_star ? {
                    type: Text,
                    text: to_star,
                    x: tagX + 20 + sterilizedWidth + tagPadding * 2 + adoptDescWidth + tagPadding * 2,
                    y: 705 + tag / 2,
                    width: to_starWidth + tagPadding * 2,
                    fontSize: tag,
                    ellipsis: 1,
                    align: 'center',
                    fontWeight: 'bold',
                    color: '#fff'
                } : null,
                // 这里是分界线
                {
                    type: Text,
                    text: text_cfg.app_name,
                    x: 50,
                    y: 790,
                    fontSize: title,
                    lineHeight: title * 1.8,
                    color: '#222'
                }, {
                    type: Text,
                    text: text_cfg.detail_cat.slogan1,
                    x: 50,
                    y: 790 + title * 1.8,
                    fontSize: desc,
                    lineHeight: desc + lineHeight_n,
                    color: '#777'
                }, {
                    type: Text,
                    text: text_cfg.detail_cat.slogan2,
                    x: 50,
                    y: 790 + title * 1.8 + desc + lineHeight_n,
                    fontSize: desc,
                    lineHeight: desc + lineHeight_n,
                    color: '#777'
                }, {
                    type: Image,
                    url: await signCosUrl(cat.mpcode),
                    x: 480,
                    y: 785,
                    width: 120,
                    height: 120,
                    radius: 20
                }
            ]
            // 过滤无效的元素
            const validSeries = series.filter(item => item && item.type);
            return canvas.draw({ series: validSeries }).then(() => {
                wx.hideLoading();
            });
        },

        // 保存并分享图片
        async saveAndShareImage(catId, coverId) {
            const url = await canvas.getTempFilePath({
                destWidth: this.data.posterWidth,
                destHeight: this.data.posterHeight,
            });
            // console.log(url);
            wx.setStorageSync(`poster_${catId}_${coverId}`, url);
            wx.showShareImageMenu({
                path: url,
                success: () => {
                    wx.showToast({ title: '搞定(^・ω・^ )', icon: 'success' });
                }
            });
        }
    }
})