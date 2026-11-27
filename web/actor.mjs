// Read only named tensor storage from the pinned SB3/PyTorch archives.
// Never execute Python pickle data in the browser.
async function entry(bytes, name) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end,true) !== 0x06054b50) end--;
  if (end < 0) throw Error('ZIP không hợp lệ');
  let p = view.getUint32(end+16,true);
  while (view.getUint32(p,true) === 0x02014b50) {
    const len = view.getUint16(p+28,true);
    if (new TextDecoder().decode(bytes.subarray(p+46,p+46+len)) === name) {
      const offset = view.getUint32(p+42,true);
      const start = offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);
      const data = bytes.slice(start,start+view.getUint32(p+20,true));
      const method = view.getUint16(p+10,true);
      if (method === 0) return data;
      if (method !== 8) throw Error('Nén ZIP chưa hỗ trợ');
      return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    }
    p += 46+len+view.getUint16(p+30,true)+view.getUint16(p+32,true);
  }
  throw Error('Thiếu '+name);
}

export async function weights(bytes) {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), b=>b.toString(16).padStart(2,'0')).join('');
  if (hash !== 'deb56a9a4dab920ecc18fa322ab21902686c1e9aed446b318bc2b6966332c744') throw Error('Checkpoint khác phiên bản');
  const policy = await entry(bytes,'policy.pth');
  return Promise.all([8,9,10,11,0,1,4,5].map(async i=>new Float32Array((await entry(policy,'archive/data/'+i)).buffer)));
}

function dot(matrix,row,input) {
  let sum=0, start=row*input.length;
  for(let i=0;i<input.length;i++) sum+=matrix[start+i]*input[i];
  return sum;
}
const sigmoid=x=>1/(1+Math.exp(-x));
export function actor([wi,wh,bi,bh,wp,bp,wa,ba]) {
  const h=new Float32Array(128), c=new Float32Array(128);
  const gates=new Float32Array(512), hidden=new Float32Array(64);
  return obs=>{
    for(let j=0;j<512;j++) gates[j]=bi[j]+bh[j]+dot(wi,j,obs)+dot(wh,j,h);
    for(let j=0;j<128;j++) {
      c[j]=sigmoid(gates[128+j])*c[j]+sigmoid(gates[j])*Math.tanh(gates[256+j]);
      h[j]=sigmoid(gates[384+j])*Math.tanh(c[j]);
    }
    for(let j=0;j<64;j++) hidden[j]=Math.tanh(bp[j]+dot(wp,j,h));
    return Array.from(ba,(bias,j)=>bias+dot(wa,j,hidden));
  };
}
