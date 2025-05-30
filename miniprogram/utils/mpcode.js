import api from "./cloudApi";
import { signCosUrl } from "../utils/common";

// 生成小程序码
async function generateMpCode(cat) {
    // 如果有就不用再生成了
    if (cat.mpcode) {
    return cat.mpcode;
    }

    // 如果目前没有，那就先生成一个
    var res = await api.getMpCode({
    _id: cat._id,
    scene: 'toC=' + cat.no,
    page: 'pages/genealogy/genealogy',
    width: 500,
    });
    res = await signCosUrl(res);
    cat.mpcode = res;
    return cat.mpcode;
}

// 展示
async function showMpcode(cat) {
    const mpcode = await generateMpCode(cat);
    wx.previewImage({
        urls: [await signCosUrl(mpcode)],
    });
}

export {
    generateMpCode, showMpcode
}