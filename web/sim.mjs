export const CELL=.30, DT=.005, TRACK=.12, RADIUS=.03;
const dirs=[[1,0],[0,1],[-1,0],[0,-1]], relative=[0,1,3,2];
const clamp=(v,limit)=>Math.max(-limit,Math.min(limit,v));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function maze(n,seed) {
  const cells=new Uint8Array(n*n), seen=new Set([0]), stack=[0];
  while(stack.length) {
    const cur=stack.at(-1), x=cur%n,y=Math.floor(cur/n);
    const options=dirs.map(([dx,dy],d)=>({x:x+dx,y:y+dy,d})).filter(p=>p.x>=0&&p.x<n&&p.y>=0&&p.y<n&&!seen.has(p.y*n+p.x));
    if(!options.length){stack.pop();continue;}
    seed=(Math.imul(1664525,seed)+1013904223)>>>0;
    const p=options[Math.floor(seed/4294967296*options.length)], next=p.y*n+p.x;
    cells[cur]|=1<<p.d; cells[next]|=1<<((p.d+2)%4);
    stack.push(next);seen.add(next);
  }
  return cells;
}
export function segments(cells,n) {
  const out=[];
  for(let i=0;i<cells.length;i++) {
    const x=i%n,y=Math.floor(i/n),mask=cells[i];
    if(!(mask&1))out.push([x+1,y,x+1,y+1]);
    if(!(mask&2))out.push([x,y+1,x+1,y+1]);
    if(x===0)out.push([x,y,x,y+1]);
    if(y===0)out.push([x,y,x+1,y]);
  }
  return out.map(row=>row.map(v=>v*CELL));
}
function range(x,y,a,walls) {
  const dx=Math.cos(a),dy=Math.sin(a);
  let best=1.2;
  for(const [x1,y1,x2,y2] of walls) {
    const vertical=x1===x2, dir=vertical?dx:dy;
    if(Math.abs(dir)<1e-9)continue;
    const t=(vertical?x1-x:y1-y)/dir;
    const cross=vertical?y+t*dy:x+t*dx;
    if(t>=0&&t<best&&cross>=(vertical?y1:x1)-1e-9&&cross<=(vertical?y2:x2)+1e-9)best=t;
  }
  return best;
}
export class Robot {
  constructor(n,seed,policy) {
    Object.assign(this,{n,policy,walls:segments(maze(n,seed),n),x:CELL/2,y:CELL/2,yaw:0,cell:0,h:0,
      left:0,right:0,ticks:0,moves:0,blocked:0,phase:'ready',trail:[0],action:null});
    this.visits=new Uint16Array(n*n);this.visits[0]=1;
  }
  sensors() {
    return [0,Math.PI/2,-Math.PI/2,Math.PI,Math.PI/4,-Math.PI/4].map(a=>range(this.x,this.y,this.yaw+a,this.walls));
  }
  observation() {
    const r=this.sensors().slice(0,4), x=this.cell%this.n,y=Math.floor(this.cell/this.n);
    const counts=relative.map(d=>{
      const [dx,dy]=dirs[(this.h+d)%4],col=x+dx,row=y+dy;
      return col>=0&&row>=0&&col<this.n&&row<this.n?this.visits[row*this.n+col]:0;
    });
    const gx=this.n-1-x,gy=this.n-1-y,len=Math.hypot(gx,gy)||1;
    const c=Math.cos(this.yaw),s=Math.sin(this.yaw);
    return Float32Array.from([...r.map(v=>+(v>.216)),...r.map(v=>v/1.2),...counts.map(v=>+(v>0)),...counts.map(v=>Math.min(v,4)/4),(gx*c+gy*s)/len,(-gx*s+gy*c)/len,s,c]);
  }
  decide() {
    const obs=this.observation(),scores=this.policy(obs);
    const ranked=[0,1,2,3].sort((a,b)=>scores[b]-scores[a]);
    if(!obs[ranked[0]])this.blocked++;
    this.action=ranked.find(a=>obs[a]);
    if(this.action===undefined){this.phase='stalled';return;}
    this.h=(this.h+relative[this.action])%4;
    this.targetYaw=this.h*Math.PI/2;this.phase='turn';
    this.integral=0;this.lastError=wrap(this.targetYaw-this.yaw);
  }
  wheels(v,w) {
    const vl=v-w*TRACK/2,vr=v+w*TRACK/2;
    this.left+=vl*DT/RADIUS;this.right+=vr*DT/RADIUS;
    const mid=this.yaw+w*DT/2;
    this.x+=v*DT*Math.cos(mid);this.y+=v*DT*Math.sin(mid);this.yaw=wrap(this.yaw+w*DT);
  }
  tick() {
    if(this.phase==='ready')this.decide();
    if(!['turn','drive'].includes(this.phase))return;
    this.ticks++;
    const e=wrap(this.targetYaw-this.yaw);
    this.integral=clamp(this.integral+e*DT,.4);
    const w=clamp(10*e+.3*this.integral+.12*(e-this.lastError)/DT,6);this.lastError=e;
    if(this.phase==='turn') {
      this.wheels(0,w);
      if(Math.abs(e)<.003){this.phase='drive';this.origin=(this.left+this.right)/2;}
      return;
    }
    const remaining=Math.max(0,CELL-(this.left+this.right-2*this.origin)*RADIUS/2);
    this.wheels(Math.min(.62,remaining/DT,Math.sqrt(4*remaining)),w);
    if(remaining<=.00001) {
      const [dx,dy]=dirs[this.h];this.cell+=dx+dy*this.n;
      this.visits[this.cell]++;this.trail.push(this.cell);this.moves++;
      this.phase=this.cell===this.n*this.n-1?'goal':this.moves>=120?'limit':'ready';
    }
  }
}
export const leastVisited=obs=>[0,1,2,3].map(i=>-obs[12+i]);
