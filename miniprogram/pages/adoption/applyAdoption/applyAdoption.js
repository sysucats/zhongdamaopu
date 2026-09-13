// 提交领养申请
import { getCatItem, getAvatar } from "../../../utils/cat";
import { getUser } from "../../../utils/user";
import api from "../../../utils/cloudApi";

const app = getApp();

Page({
  data: {
    cat: {},
    form: {
      applicant_name: '',
      contact: '',
      reason: '',
    },
    submitting: false,
  },

  jsData: {
    cat_id: '',
  },

  async onLoad(options) {
    this.jsData.cat_id = options.cat_id;
    if (!this.jsData.cat_id) {
      wx.showToast({ title: '缺少猫咪信息', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    const cat = await getCatItem(this.jsData.cat_id);
    if (!cat) {
      wx.showToast({ title: '猫咪不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    // 只有"寻找领养中"的猫可以申请
    if (cat.adopt !== 2) {
      wx.showModal({
        title: '无法申请',
        content: '这只猫猫目前不在寻找领养中',
        showCancel: false,
        success: () => wx.navigateBack(),
      });
      return;
    }

    // 头像（getCatItem返回的是原始猫文档，封面需单独获取）
    const avatar = await getAvatar(this.jsData.cat_id);
    this.setData({
      cat,
      avatarUrl: avatar ? (avatar.photo_compressed || avatar.photo_id) : '',
    });
    wx.setNavigationBarTitle({ title: `领养${cat.name}` });

    // 预填昵称
    const user = await getUser();
    const nickname = user && user.userInfo && user.userInfo.nickName;
    if (nickname) {
      this.setData({ 'form.applicant_name': nickname });
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value,
    });
  },

  async submit() {
    const { form, submitting } = this.data;
    if (submitting) return;

    if (!form.applicant_name.trim()) {
      wx.showToast({ title: '请填写姓名/称呼', icon: 'none' });
      return;
    }
    if (!form.contact.trim()) {
      wx.showToast({ title: '请填写联系方式', icon: 'none' });
      return;
    }
    if (!form.reason.trim()) {
      wx.showToast({ title: '请填写申请理由', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...' });

    try {
      const res = await api.adoptionOp({
        operation: 'apply',
        data: {
          cat_id: this.jsData.cat_id,
          applicant_name: form.applicant_name.trim(),
          contact: form.contact.trim(),
          reason: form.reason.trim(),
        },
      });

      wx.hideLoading();
      if (res.result) {
        wx.showModal({
          title: '提交成功',
          content: res.msg || '申请已提交，请等待管理员审核。你可以在「我的-我的领养」中查看进度。',
          showCancel: false,
          success: () => wx.navigateBack(),
        });
      } else {
        wx.showModal({ title: '提交失败', content: res.msg || '请稍后重试', showCancel: false });
        this.setData({ submitting: false });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[submit] - 提交领养申请失败:', err);
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
