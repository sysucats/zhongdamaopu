import cloud from '@lafjs/cloud'

export default async function (ctx: FunctionContext) {
  const db = cloud.database();
  let res = await db.collection('cat')
    .aggregate()
    .project({
      _id: 1,
      gender: 1,
      colour: 1,
      name: 1,
      campus: 1,
      area: 1,
      relations: 1,
    })
    .end()
  console.log(res.data.length);
  return res.data;
}


/**
 * 
 * 返回值
 * 
        nodes: [
          { id: 'a', text: 'A', borderColor: 'yellow' },
          { id: 'b', text: 'B', color: '#43a2f1', fontColor: 'yellow' },
          { id: 'c', text: 'C', nodeShape: 1, width: 80, height: 60 },
          { id: 'e', text: 'E', nodeShape: 0, width: 150, height: 150 },
          { id: 'f', text: 'F', nodeShape: 0, width: 200, height: 150 }
        ],
        lines: [
          { from: 'a', to: 'b', text: '关系1', color: '#43a2f1' },
          { from: 'a', to: 'c', text: '关系2' },
          { from: 'a', to: 'e', text: '关系3' },
          { from: 'b', to: 'e', text: '', color: '#67C23A' },
          { from: 'f', to: 'e', text: '', color: '#67C23A' }
        ]
 */
