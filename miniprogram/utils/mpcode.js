import api from "./cloudApi";
import { signCosUrl } from "../utils/common";

// 生成小程序码
async function generateMpCode(cat) {
    // 如果有就不用再生成了
    if (cat.mpcode) {
        return cat.mpcode;
    }

    try {
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
    } catch (err) {
        wx.showToast({
            title: '生成小程序码失败',
            icon: 'none'
        });
        throw err;
    }
}

// 展示
async function showMpcode(cat) {
    try {
        const mpcode = await generateMpCode(cat);
        console.log(mpcode);
        wx.previewImage({
            urls: [await signCosUrl(mpcode)],
        });
    } catch (err) {
        console.log(err);
    }
}

export {
    generateMpCode, showMpcode
}