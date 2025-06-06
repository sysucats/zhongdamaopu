import { likeAdd, likeCheck } from "../../../utils/inter";
import { downloadFile } from "../../../utils/common"
module.exports =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 21);
/******/ })
/************************************************************************/
/******/ ({

/***/ 21:
/***/ (function(module, exports, __webpack_require__) {

"use strict";

// 此锁为false时，不发送点赞请求
var like_mutex = true;

Component({
    options: {
        addGlobalClass: true
    },
    properties: {
        galleryPhotos: {
            type: Array,
            value: [],
            observer: function observer(newVal, oldVal, changedPath) {
                var imgCompressedUrls = newVal.map((photo) => {
                    return (photo.photo_compressed || photo.photo_watermark || photo.photo_id);
                });
                var imgUrls = newVal.map((photo) => {
                    return (photo.photo_watermark || photo.photo_id);
                });
                this.setData({
                    photos: newVal,
                    imgCompressedUrls: imgCompressedUrls,
                    imgUrls: imgUrls
                }, () => {
                    this.checkLike(this.data.current);
                });
            }
        },
        show: {
            type: Boolean,
            value: true,
        },
        current: {
            type: Number,
            value: 0
        },
        hideOnClick: {
            type: Boolean,
            value: true
        },
        extClass: {
            type: Boolean,
            value: ''
        },
        cat: {
            type: Object,
            value: null
        },
    },
    data: {
        canReverse: false,  // 是否可以取消点赞
        liked: false,  // 是否点赞过当前照片
    },
    methods: {
        change: function change(e) {
            this.setData({
                current: e.detail.current
            });
            this.checkLike(e.detail.current);
            this.triggerEvent('change', { current: e.detail.current }, {});
        },
        hideGallery: function hideGallery() {
            var data = this.data;
            if (data.hideOnClick) {
                this.setData({
                    show: false
                });
                this.triggerEvent('hide', {}, {});
            }
        },
        showOriginImg: function showOriginImg() {
            var data = this.data;
            var url = data.imgUrls[data.current];
            wx.previewImage({
              urls: [url],
            });
        },
        checkLike: async function checkLike(i) {
            if (!this.data.photos.length) {
                return;
            }
            like_mutex = false;

            const photo_id = this.data.photos[i]._id;
            const liked = (await likeCheck([photo_id]))[0];
            this.setData({
                liked: liked,
            }, () => {
                like_mutex = true;
            });
        },
        clickLike: function clickLike(e) {
            if (!like_mutex) {
                return false;
            }
            var liked = !this.data.liked;
            // 不能取消赞
            if (!liked && !this.data.canReverse) {
                return;
            }

            const current = this.data.current;
            var like_count = this.data.photos[current].like_count || 0;
            like_count = liked? like_count+1: like_count-1;
            this.setData({
                liked: liked,
                [`photos[${current}].like_count`]: like_count,
            });

            // 执行数据库写入
            if (liked) {
                likeAdd(this.data.photos[current]._id, "photo");
            } else {
                // todo
            }

            this.triggerEvent("likecountchanged", {current: current, like_count: like_count}, {});
        },
        
        async bindGalleryLongPress(e) {
            const that = this;
            wx.showActionSheet({
                itemList: ['保存（压缩图）'],
                async success(res) {
                    // 用户选择取消时不会回调success，不过还是判断一下吧
                    if (res.tapIndex == 0) {
                        console.log('保存图片');
                        wx.showLoading({
                            title: '正在保存...',
                            mask: true,
                        })
                        let downloadRes = await downloadFile(that.data.imgUrls[that.data.current]);
                        console.log('downloadFile', downloadRes);
                        wx.hideLoading();
                        if (downloadRes) {
                            wx.saveImageToPhotosAlbum({
                                filePath: downloadRes.tempFilePath,
                                success(res) {
                                    wx.showToast({
                                        title: '已保存到相册',
                                        icon: 'success',
                                    })
                                }
                            });
                        } else {
                            console.log(downloadRes);
                        }
                    }
                },
            });
        },

        // 展示分享海报
        async showPoster() {
            let posterComponent = this.selectComponent('#posterComponent');
            if (posterComponent) {
            posterComponent.startDrawing();
            }
        }
    }
});

/***/ })

/******/ });