import {weights,actor} from './actor.mjs';
import {Robot,leastVisited,CELL,DT} from './sim.mjs';
const el=id=>document.getElementById(id);
const board=el('board'),ctx=board.getContext('2d');
let tensors,robot,running=false,single=false,previous=0,carry=0,loadError='';
const names=['Trước','Trái','Phải','Sau','Chéo trái','Chéo phải'];
const labels=['Số ô đã đi','Thời gian ảo','Lệnh gần nhất','Hướng gyro','Encoder T/P (vòng)','Lệnh bị lọc'];
el('stats').innerHTML=labels.map(s=>'<div class="row"><span>'+s+'</span><b></b></div>').join('');
el('sensors').innerHTML=names.map(s=>'<div class="range"><span>'+s+'</span><meter min="0" max="120"></meter><b></b></div>').join('');
function draw(){
  const {n,walls,trail,x,y,yaw}=robot;
  const pad=30,k=(640-2*pad)/(n*CELL),px=x=>pad+x*k,py=y=>640-pad-y*k;
  ctx.clearRect(0,0,640,640);
  ctx.lineWidth=2;ctx.strokeStyle='#233942';
  for(let i=1;i<n;i++){line(i*CELL,0,i*CELL,n*CELL);line(0,i*CELL,n*CELL,i*CELL);}
  function line(x,y,u,v){ctx.beginPath();ctx.moveTo(px(x),py(y));ctx.lineTo(px(u),py(v));ctx.stroke();}
  ctx.lineCap='round';ctx.strokeStyle='#b8d8d9';ctx.lineWidth=5;
  for(const wall of walls)line(...wall);
  ctx.strokeStyle='#5fb89f';ctx.lineWidth=5;ctx.beginPath();
  trail.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](px((v%n+.5)*CELL),py((Math.floor(v/n)+.5)*CELL)));
  ctx.lineTo(px(x),py(y));ctx.stroke();
  const goal=(n-.5)*CELL;ctx.fillStyle='#fc9084';ctx.fillRect(px(goal)-9,py(goal)-9,18,18);
  ctx.save();ctx.translate(px(x),py(y));ctx.rotate(-yaw);ctx.scale(k,k);
  ctx.fillStyle='#ffd477';ctx.fillRect(-.06,-.048,.12,.096);ctx.fillStyle='#352c21';ctx.fillRect(.022,-.033,.018,.066);ctx.restore();
  const values=[robot.moves,(robot.ticks*DT).toFixed(2)+' s',['Tiến','Trái','Phải','Quay đầu'][robot.action]??'—',Math.round(yaw*180/Math.PI)+'°',[robot.left,robot.right].map(v=>(v/(2*Math.PI)).toFixed(1)).join(' / '),robot.blocked];
  document.querySelectorAll('#stats b').forEach((b,i)=>b.textContent=values[i]);
  robot.sensors().forEach((v,i)=>{const row=el('sensors').children[i];row.children[1].value=v*100;row.lastChild.textContent=Math.round(v*100)+' cm';});
  const end={goal:'Đã tới đích',limit:'Hết 120 bước',stalled:'Bị chặn'}[robot.phase];
  if(end)running=false;
  const missing=el('policy').value==='rl'&&!tensors;
  el('status').textContent=missing?(loadError||'Đang tải LSTM…'):end||(running?'Đang chạy':robot.ticks?'Tạm dừng':'Sẵn sàng');
  el('run').textContent=running?'Tạm dừng':'Chạy';el('run').disabled=!!end||missing;
  el('step').disabled=running||!!end||missing;
}
function reset(){
  running=false;single=false;carry=0;
  if(!el('seed').reportValidity()){el('run').disabled=el('step').disabled=true;return;}
  robot=new Robot(+el('size').value,+el('seed').value,el('policy').value==='rl'&&tensors?actor(tensors):leastVisited);
  draw();
}
async function init(){
  reset();
  try{const response=await fetch('checkpoints/maze_5x5_hier_best.zip');if(!response.ok)throw Error('HTTP '+response.status);tensors=await weights(new Uint8Array(await response.arrayBuffer()));}
  catch(e){loadError='Lỗi tải LSTM · '+e.message;}
  if(el('policy').value==='rl')reset();
}
el('reset').onclick=reset;
for(const id of ['size','seed','policy'])el(id).onchange=reset;
el('run').onclick=()=>{single=false;running=!running;draw();};
el('step').onclick=()=>{single=true;running=true;};
function frame(time){
  if(running){
    carry+=Math.min(.1,(time-previous)/1000)*Number(el('speed').value);
    while(carry>=DT&&running){
      const before=robot.moves;robot.tick();carry-=DT;
      if((single&&robot.moves!==before)||['goal','limit','stalled'].includes(robot.phase)){running=false;carry=0;}
    }
    draw();
  }
  previous=time;requestAnimationFrame(frame);
}
init();requestAnimationFrame(frame);
