import { formatDate } from "./utils";

function paperOffset(seed, salt, min, max) {
  const key = `${seed}:${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  }
  return min + (hash >>> 0) % (max - min);
}

// Date objects become {} when passed through mini-program component properties.
export function serializeCommentPaper(item) {
  const date = item.create_date ? new Date(item.create_date) : null;
  return {
    ...item,
    create_date: date && !isNaN(date.getTime()) ? date.toISOString() : null,
  };
}

export function decorateCommentPaper(item) {
  const date = item.create_date ? new Date(item.create_date) : null;
  item.datetime = date && !isNaN(date.getTime()) ? formatDate(date, 'yyyy年MM月dd日 hh:mm') : (item.datetime || '');
  const seed = item._id || `${item.cat_id || ''}:${item.content || ''}`;
  item.rotate = paperOffset(seed, 'paper', -5, 5);
  item.tape_pos_left = paperOffset(seed, 'position', 20, 520);
  item.tape_rotate = paperOffset(seed, 'tape', -50, 50);
  return item;
}
