import api from "../../../../utils/cloudApi";
import { formatDate } from "../../../../utils/utils";
import { signCosUrl } from "../../../../utils/common";
import { isManagerAsync } from "../../../../utils/user";

const TYPE_NAMES = {
  vaccine: '疫苗',
  sterilize: '绝育',
  clinic: '就诊',
  deworm: '驱虫',
  injury: '伤病',
  other: '其他',
};

Page({
  data: {
    loading: true,
    errorText: '',
    record: null,
    photos: [],
    isManager: false,
  },

  onLoad(options) {
    this.recordId = options.record_id || '';
    this.catId = options.cat_id || '';
    this.loadRecord();
    // 无照片时给管理员一句「去哪补图」的提示，普通用户不显示
    isManagerAsync().then(isManager => {
      this.setData({ isManager: !!isManager });
    }).catch(error => {
      console.warn('[medicalDetail] 管理员身份判定失败', error);
    });
  },

  async loadRecord() {
    if (!this.recordId) {
      this.setData({ loading: false, errorText: '缺少记录ID' });
      return;
    }
    this.setData({ loading: true, errorText: '' });
    try {
      const res = await api.medicalOp({ operation: 'get', record_id: this.recordId });
      if (!res || res.result !== true || !res.data) {
        throw new Error((res && res.msg) || '加载失败');
      }
      const raw = res.data;
      const rawPhotos = Array.isArray(raw.photos) ? raw.photos.filter(url => typeof url === 'string' && url) : [];
      // 私有读桶：库里的裸地址必须签名后才能加载，否则 403（图片空白）
      const photos = await Promise.all(rawPhotos.map(async url => {
        try {
          return await signCosUrl(url);
        } catch (error) {
          console.warn('[medicalDetail] 照片签名失败', error);
          return url;
        }
      }));
      const todayStr = formatDate(new Date(), 'yyyy-MM-dd');
      const expireStr = raw.expire_date ? formatDate(raw.expire_date, 'yyyy-MM-dd') : '';
      const record = {
        ...raw,
        typeName: TYPE_NAMES[raw.type] || '记录',
        record_date_formatted: raw.record_date ? formatDate(raw.record_date, 'yyyy-MM-dd') : '',
        expire_date_formatted: expireStr,
        next_vaccine_date_formatted: raw.next_vaccine_date ? formatDate(raw.next_vaccine_date, 'yyyy-MM-dd') : '',
        // 用 yyyy-MM-dd 字符串比较，避免 new Date('Sat Nov 21 2026') 这类非标准格式在 iOS 上的告警
        is_expired: !!expireStr && expireStr < todayStr,
        photos,
      };
      this.setData({ loading: false, record, photos });
      wx.setNavigationBarTitle({ title: record.typeName === '疫苗' ? '疫苗详情' : '医疗记录' });
    } catch (error) {
      console.error('[medicalDetail] 加载失败', error);
      this.setData({ loading: false, record: null, errorText: error.message || '加载失败' });
    }
  },

  previewPhoto(e) {
    const current = e.currentTarget.dataset.src;
    if (!current) return;
    wx.previewImage({ current, urls: this.data.photos });
  },

  retry() {
    this.loadRecord();
  },
});
