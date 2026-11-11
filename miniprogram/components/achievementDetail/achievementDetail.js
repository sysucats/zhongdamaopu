import { formatDate } from "../../utils/utils";

Component({
  properties: {
    achievement: {
      type: Object,
      value: null,
      observer(value) {
        const date = value?.unlock_time_text || (value?.unlock_time ? formatDate(new Date(value.unlock_time), 'yyyy-MM-dd') : '');
        const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        this.setData({
          stampDay: match ? `${match[2]}.${match[3]}` : '',
          stampYear: match ? match[1] : '',
          progress: value?.unlocked
            ? value.threshold
            : (value?.currentCount === null || value?.currentCount === undefined
              ? null
              : Math.min(value.threshold, value.currentCount)),
        });
      },
    },
  },
  data: {
    stampDay: '',
    stampYear: '',
    progress: null,
  },
  methods: {
    close() { this.triggerEvent('close'); },
  },
});
