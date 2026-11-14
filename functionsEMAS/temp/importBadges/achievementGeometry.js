// Shared, precomputed badge outline and engraving area. No user-specific image assets.
function smoothLoop(points) {
  const ring=points.slice(0,-1), cumulative=[0];
  for(let i=0;i<ring.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(ring[(i+1)%ring.length][0]-ring[i][0],ring[(i+1)%ring.length][1]-ring[i][1]));
  const total=cumulative.at(-1),count=Math.ceil(total/1.5),samples=[];let segment=0;
  // Uniform arc-length samples prevent a long straight segment from rounding away a corner.
  for(let i=0;i<count;i++){
    const at=i/count*total;
    while(segment<ring.length-1&&cumulative[segment+1]<at)segment++;
    const a=ring[segment],b=ring[(segment+1)%ring.length],t=(at-cumulative[segment])/(cumulative[segment+1]-cumulative[segment]);
    samples.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
  }
  const filtered=samples.map((_,i)=>{
    let x=0,y=0,weight=0;
    for(let k=-10;k<=10;k++){
      const w=Math.exp(-k*k/(2*3.2*3.2)),p=samples[(i+k+count)%count];x+=p[0]*w;y+=p[1]*w;weight+=w;
    }
    return [x/weight,y/weight];
  });
  // Two corner-cutting passes remove residual polygon joints with subpixel deviation.
  let result=filtered;
  for(let pass=0;pass<2;pass++){
    const next=[];
    for(let i=0;i<result.length;i++){
      const a=result[i],b=result[(i+1)%result.length];
      next.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);
    }
    result=next;
  }
  return result.filter((_,i)=>i%12===0);
}

function traceGeometry(png) {
  const { width:w, height:h, data } = png;
  // Blur alpha before tracing so antialiasing/shadow specks never become metal geometry.
  const horizontal=new Float32Array(w*h),blurred=new Float32Array(w*h);
  const kernel=Array.from({length:9},(_,i)=>Math.exp(-((i-4)**2)/(2*1.6*1.6)));
  const weight=kernel.reduce((a,b)=>a+b,0);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let sum=0;for(let k=-4;k<=4;k++)sum+=data[(y*w+Math.max(0,Math.min(w-1,x+k)))*4+3]*kernel[k+4];horizontal[y*w+x]=sum/weight;
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let sum=0;for(let k=-4;k<=4;k++)sum+=horizontal[Math.max(0,Math.min(h-1,y+k))*w+x]*kernel[k+4];blurred[y*w+x]=sum/weight;
  }
  const mask = new Uint8Array(w*h);
  for (let i=0; i<mask.length; i++) mask[i] = blurred[i] > 128 ? 1 : 0;
  // Keep only the actual badge, excluding detached antialiasing specks.
  const visited = new Uint8Array(mask.length); let largest = [];
  for (let i=0; i<mask.length; i++) {
    if (!mask[i] || visited[i]) continue;
    const component = [i]; visited[i] = 1;
    for (let j=0; j<component.length; j++) {
      const n=component[j], x=n%w, y=Math.floor(n/w);
      for (const next of [x>0?n-1:-1,x<w-1?n+1:-1,y>0?n-w:-1,y<h-1?n+w:-1]) {
        if (next>=0 && mask[next] && !visited[next]) { visited[next]=1; component.push(next); }
      }
    }
    if (component.length>largest.length) largest=component;
  }
  mask.fill(0); for (const i of largest) mask[i]=1;
  const inside=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&mask[y*w+x];
  const edges = new Map();
  const edge=(x,y,a,b)=>{const key=y*(w+1)+x; if(!edges.has(key))edges.set(key,[]);edges.get(key).push([a,b]);};
  for (let y=0;y<h;y++) for(let x=0;x<w;x++) {
    if(!inside(x,y))continue;
    if(!inside(x,y-1))edge(x,y,x+1,y);
    if(!inside(x+1,y))edge(x+1,y,x+1,y+1);
    if(!inside(x,y+1))edge(x+1,y+1,x,y+1);
    if(!inside(x-1,y))edge(x,y+1,x,y);
  }
  const loops=[];
  while(edges.size) {
    const key=edges.keys().next().value, start=[key%(w+1),Math.floor(key/(w+1))];
    const points=[start];let current=start;
    for(let n=0;n<20000;n++) {
      const k=current[1]*(w+1)+current[0], list=edges.get(k);
      if(!list?.length)break;
      current=list.pop();if(!list.length)edges.delete(k);
      points.push(current);if(current[0]===start[0]&&current[1]===start[1])break;
    }
    const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;
    if(Math.abs(area)>40)loops.push({points,area});
  }
  loops.sort((a,b)=>Math.abs(b.area)-Math.abs(a.area));
  const contours=loops.map(loop=>smoothLoop(loop.points));
  // Distance from transparent pixels, then an integral image for safe rectangle queries.
  const d=new Float32Array(w*h).fill(1e4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(!mask[i])d[i]=0;
    else d[i]=Math.min(d[i],x?d[i-1]+1:1,y?d[i-w]+1:1);
  }
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;d[i]=Math.min(d[i],x<w-1?d[i+1]+1:1,y<h-1?d[i+w]+1:1);}
  const stride=w+1,prefix=new Uint32Array((w+1)*(h+1));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y+1)*stride+x+1;prefix[i]=(d[y*w+x]<15?1:0)+prefix[i-1]+prefix[i-stride]-prefix[i-stride-1];}
  let safe=null;
  for(let rw=300;rw>=80&&!safe;rw-=4){
    const rh=Math.round(rw/2.3);let candidates=[];
    for(let y=16;y+rh<h-16;y+=3)for(let x=16;x+rw<w-16;x+=3){
      const bad=prefix[(y+rh)*stride+x+rw]-prefix[y*stride+x+rw]-prefix[(y+rh)*stride+x]+prefix[y*stride+x];
      if(!bad)candidates.push({x,y,w:rw,h:rh,score:Math.hypot(x+rw/2-w/2,y+rh/2-h/2)});
    }
    if(candidates.length)safe=candidates.sort((a,b)=>a.score-b.score)[0];
  }
  if(!safe)throw new Error('轮廓内没有足够的刻字空间，请调整徽章外形');
  return {width:w,height:h,contours,safe};
}


function createBadgeGeometry(front) {
  const scale = Math.min(1, 512 / Math.max(front.width, front.height));
  const width = Math.round(front.width * scale), height = Math.round(front.height * scale);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = (Math.min(front.height - 1, Math.floor(y / scale)) * front.width + Math.min(front.width - 1, Math.floor(x / scale))) * 4;
    data.set(front.data.subarray(from, from + 4), (y * width + x) * 4);
  }
  const geometry = traceGeometry({ width, height, data });
  const { x, y, w, h } = geometry.safe;
  return { version: 1, width, height, contours: geometry.contours.map(loop => loop.map(point => point.map(value => Math.round(value * 100) / 100))), safe: { x, y, w, h } };
}

module.exports = { createBadgeGeometry };
