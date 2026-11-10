import { decorateCommentPaper } from '../../utils/commentPaper';

Component({
  properties: {
    item: { type: Object, value: null },
    headerMode: { type: String, value: 'author' },
    canDelete: { type: Boolean, value: false },
    maskPending: { type: Boolean, value: false },
  },

  data: { note: null },

  observers: {
    'item.**'(item) {
      this.setData({ note: item ? decorateCommentPaper({ ...item }) : null });
    },
  },

  methods: {
    open() {
      this.triggerEvent('open', { catId: this.data.note?.cat_id });
    },

    like() {
      const note = this.data.note;
      if (!note?._id || note.needVerify || note.deleted) return;
      this.triggerEvent('like', { itemId: note._id });
    },

    remove() {
      if (this.data.canDelete) this.triggerEvent('delete', { item: this.data.note });
    },
  },
});
