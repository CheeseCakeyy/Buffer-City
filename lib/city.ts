export type Vec = [number,number,number];
export type Box = {min:Vec;max:Vec;name:string;kind:string;detail?:string};
export type Hit = {t:number;normal:Vec;box:Box|null};
export type CityStats = {time:string;fps:number;cells:number;selected:string};
const dot=(a:Vec,b:Vec)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const mod=(n:number,m:number)=>(n%m+m)%m;
export function intersectBox(o:Vec,d:Vec,b:Box):Hit|null {
 let near=-Infinity,far=Infinity; let normal:Vec=[0,0,0],exitNormal:Vec=[0,0,0];
 for(let a=0;a<3;a++){
  if(Math.abs(d[a])<1e-9){if(o[a]<b.min[a]||o[a]>b.max[a])return null;continue;}
  let t1=(b.min[a]-o[a])/d[a],t2=(b.max[a]-o[a])/d[a],sign=-1;
  if(t1>t2){[t1,t2]=[t2,t1];sign=1;}
  if(t1>near){near=t1;normal=[0,0,0];normal[a]=sign;}
  if(t2<far){far=t2;exitNormal=[0,0,0];exitNormal[a]=-sign;}
  if(near>far)return null;
 }
 if(far<0)return null;
 return {t:near>=0?near:far,normal:near>=0?normal:exitNormal,box:b};
}
export function canWalk(x:number,z:number,boxes:Box[]){
 return Math.abs(x)<25&&Math.abs(z)<25&&!boxes.some(b=>b.min[1]<1.6&&x>b.min[0]-.35&&x<b.max[0]+.35&&z>b.min[2]-.35&&z<b.max[2]+.35);
}
function box(x:number,z:number,w:number,d:number,h:number,name:string,kind='building',detail=''):Box{
 return {min:[x,0,z],max:[x+w,h,z+d],name,kind,detail};
}
export function buildings():Box[]{return [
 box(-16,-16,7,9,12,'Maple House','building','Four floors of apartments above a corner grocer. Exterior only in this prototype.'),
 box(-8,-16,5,7,7,'Studio 08','building','A small neighborhood workshop.'),
 box(-16,-6,12,3,4,'Paper & Steam','building','The long, low cafÃ© on Maple Street.'),
 box(4,-16,11,6,9,'The Reading Room','building','A neighborhood library with a broad flat roof.'),
 box(5,-9,6,6,6,'Radio Supply','building','An electronics shop facing the crossing.'),
 box(-16,4,6,12,10,'Hotel Juniper','building','Three floors overlooking the southern avenue.'),
 box(-9,5,6,6,5,'Corner Records','building','The little record shop beside the courtyard.'),
 box(4,4,7,7,8,'The Exchange','building','Workspaces above the eastern sidewalk.'),
 box(12,4,4,12,13,'East Tower','building','The tallest building on the block.'),
 box(4,12,7,4,4,'Botanical Club','building','A small meeting room on the garden side.')
];}
export class City {
 keys=new Set<string>(); paused=false; mode='ink';
 private ctx:CanvasRenderingContext2D; private frame=0; private prev=0;private reportAt=0;private frames=0;
 private width=0;private height=0;private columns=0;private rows=0;private cw=7;private ch=11;
 private angle=Math.PI/4;private span=40;private player:Vec=[0,0,2];private clock=540;private elapsed=0;
 private fixed=buildings();private objects:Box[]=[];private selected='Click a building to inspect it.';private selectedName='';
 private observer:ResizeObserver;
 private focus:Vec=[0,0,2];private path:Vec[]=[];private drag:{x:number;y:number;moved:boolean}|null=null;
 private depths=new Float32Array(0);
 overview=false;
 setOverview(){this.overview=!this.overview;this.span=this.overview?74:40;}
 private pointerdown=(e:PointerEvent)=>{this.canvas.setPointerCapture(e.pointerId);this.drag={x:e.clientX,y:e.clientY,moved:false};};
 private pointermove=(e:PointerEvent)=>{if(!this.drag)return;const dx=e.clientX-this.drag.x;if(Math.abs(dx)>2||this.drag.moved){this.angle-=dx*.006;this.drag.moved=true;this.drag.x=e.clientX;}};
 private pointerup=()=>{setTimeout(()=>{this.drag=null;},0);};
 private walkTo(x:number,z:number){
  const step=.5,start=[Math.round(this.player[0]/step),Math.round(this.player[2]/step)],end=[Math.round(x/step),Math.round(z/step)];
  if(!canWalk(end[0]*step,end[1]*step,this.fixed))return;
  const key=(a:number,b:number)=>a+','+b, queue=[start],seen=new Map<string,number[]|null>([[key(...start as [number,number]),null]]);
  let head=0,found=false;
  while(head<queue.length){const c=queue[head++];if(c[0]===end[0]&&c[1]===end[1]){found=true;break;}
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=c[0]+dx,b=c[1]+dz,k=key(a,b);if(!seen.has(k)&&canWalk(a*step,b*step,this.fixed)){seen.set(k,c);queue.push([a,b]);}}
  }
  if(found){const route:Vec[]=[];let c:number[]|null=end;while(c&&(c[0]!==start[0]||c[1]!==start[1])){route.push([c[0]*step,0,c[1]*step]);c=seen.get(key(c[0],c[1]))||null;}this.path=route.reverse();}
 }

 private right:Vec=[0,0,0];private up:Vec=[0,0,0];private direction:Vec=[0,0,0];private center:Vec=[0,0,0];
 constructor(private canvas:HTMLCanvasElement,private report:(s:CityStats)=>void){
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas 2D is unavailable');this.ctx=ctx;
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
  window.addEventListener('keydown',this.keydown);window.addEventListener('keyup',this.keyup);window.addEventListener('blur',this.blur);
  canvas.addEventListener('pointerdown',this.pointerdown);canvas.addEventListener('pointermove',this.pointermove);canvas.addEventListener('pointerup',this.pointerup);canvas.addEventListener('pointercancel',this.pointerup);
  canvas.addEventListener('wheel',this.wheel,{passive:false});canvas.addEventListener('click',this.click);
  this.resize();this.frame=requestAnimationFrame(this.tick);
 }
 private resize(){const r=this.canvas.getBoundingClientRect();this.width=r.width;this.height=r.height;const dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=this.width*dpr;this.canvas.height=this.height*dpr;this.ctx.setTransform(dpr,0,0,dpr,0,0);this.columns=Math.ceil(this.width/this.cw);this.rows=Math.ceil(this.height/this.ch);this.depths=new Float32Array(this.columns*this.rows);}
 rotate(n:number){this.angle+=n*Math.PI/8;}
 zoomBy(n:number){this.span=Math.max(28,Math.min(100,this.span*n));}
 reset(){this.player=[0,0,2];this.angle=Math.PI/4;this.span=40;this.overview=false;this.path=[];}
 toggleNight(){this.clock=this.clock>=1080||this.clock<360?540:1260;}
 private blur=()=>this.keys.clear();
 private keydown=(e:KeyboardEvent)=>{
  if((e.target as HTMLElement)?.closest('button,input,textarea,select'))return;
  const k=e.key.toLowerCase();if(!['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','q','e','+','=','-','shift','home'].includes(k))return;
  e.preventDefault();this.keys.add(k);if(!e.repeat){if(k==='home')this.reset();if(k==='+'||k==='=')this.zoomBy(.87);if(k==='-')this.zoomBy(1.15);}
 };
 private keyup=(e:KeyboardEvent)=>{this.keys.delete(e.key.toLowerCase());};
 private wheel=(e:WheelEvent)=>{e.preventDefault();this.zoomBy(e.deltaY>0?1.06:.94);};
 private camera(){
  const c=Math.cos(this.angle),s=Math.sin(this.angle),e=(this.overview?35.264:27)*Math.PI/180;
  this.right=[c,0,-s];this.up=[-s*Math.sin(e),Math.cos(e),-c*Math.sin(e)];this.direction=[-s*Math.cos(e),-Math.sin(e),-c*Math.cos(e)];
  this.center=[(this.overview?0:this.focus[0])-this.direction[0]*75,2-this.direction[1]*75,(this.overview?0:this.focus[2])-this.direction[2]*75];
 }
 private ray(px:number,py:number):Vec{
  const scale=this.span/Math.min(this.width,this.height*1.35);
  const u=(px-this.width/2)*scale,v=(this.height*.62-py)*scale;
  return [this.center[0]+this.right[0]*u+this.up[0]*v,this.center[1]+this.up[1]*v,this.center[2]+this.right[2]*u+this.up[2]*v];
 }
 private trace(o:Vec):Hit|null{
  const d=this.direction;let nearest:Hit|null=null;
  const t=-o[1]/d[1];if(t>=0){const x=o[0]+t*d[0],z=o[2]+t*d[2];if(Math.abs(x)<26&&Math.abs(z)<26)nearest={t,normal:[0,1,0],box:null};}
  for(const b of this.objects){const hit=intersectBox(o,d,b);if(hit&&(!nearest||hit.t<nearest.t))nearest=hit;}
  return nearest;
 }
 private click=(e:MouseEvent)=>{
  if(this.drag?.moved)return;this.canvas.focus();const r=this.canvas.getBoundingClientRect(),hit=this.trace(this.ray(e.clientX-r.left,e.clientY-r.top));
  if(hit&&!hit.box){const o=this.ray(e.clientX-r.left,e.clientY-r.top);this.walkTo(o[0]+hit.t*this.direction[0],o[2]+hit.t*this.direction[2]);}
  this.selectedName=hit?.box?.name||'';
  this.selected=hit?.box?(hit.box.name+'. '+(hit.box.detail||'A moving part of the neighborhood.')):'Walking there. WASD takes over at any time.';
 };
 private route(t:number,r:number):[number,number,boolean]{
  const p=mod(t,r*8);if(p<r*2)return [-r+p,-r,true];if(p<r*4)return [r,-r+p-r*2,false];if(p<r*6)return [r-(p-r*4),r,true];return [-r,r-(p-r*6),false];
 }
 private simulate(dt:number){
  if(!this.paused){this.elapsed+=dt;this.clock=mod(this.clock+dt*4,1440);}
  let dx=Number(this.keys.has('d')||this.keys.has('arrowright'))-Number(this.keys.has('a')||this.keys.has('arrowleft'));
  let dz=Number(this.keys.has('s')||this.keys.has('arrowdown'))-Number(this.keys.has('w')||this.keys.has('arrowup'));
  this.angle+=(Number(this.keys.has('e'))-Number(this.keys.has('q')))*dt*1.2;
  const len=Math.hypot(dx,dz);if(len)this.path=[];
  if(!len&&this.path.length){const t=this.path[0],d=Math.hypot(t[0]-this.player[0],t[2]-this.player[2]),v=Math.min(d,dt*5);if(d<.06)this.path.shift();else{this.player[0]+=(t[0]-this.player[0])/d*v;this.player[2]+=(t[2]-this.player[2])/d*v;}}
  this.focus[0]+=(this.player[0]-this.focus[0])*(1-Math.exp(-dt*8));this.focus[2]+=(this.player[2]-this.focus[2])*(1-Math.exp(-dt*8));
  if(len){dx/=len;dz/=len;const c=Math.cos(this.angle),s=Math.sin(this.angle),speed=dt*(this.keys.has('shift')?8:4);
   const x=this.player[0]+(dx*c+dz*s)*speed,z=this.player[2]+(-dx*s+dz*c)*speed;
   if(canWalk(x,this.player[2],this.fixed))this.player[0]=x;if(canWalk(this.player[0],z,this.fixed))this.player[2]=z;
  }
  this.objects=[...this.fixed];
  for(const b of this.fixed){const x=b.min[0]+1.2,z=b.min[2]+1.2,y=b.max[1];this.objects.push({min:[x,y,z],max:[x+1.5,y+.65,z+1.5],name:b.name,kind:'roof',detail:b.detail});}
  for(let i=0;i<6;i++){const [x,z,horizontal]=this.route(this.elapsed*3+i*28,21);this.objects.push(box(x-(horizontal?1.3:.6),z-(horizontal?.6:1.3),horizontal?2.6:1.2,horizontal?1.2:2.6,1,'Car '+(i+1),'car','Following the one-way perimeter loop.'));}
  for(let i=0;i<12;i++){const [x,z]=this.route(this.elapsed*.8+i*13,18);this.objects.push(box(x-.18,z-.18,.36,.36,1.45,'Resident '+(i+1),'person','Walking a simple sidewalk loop.'));}
  this.objects.push(box(this.player[0]-.27,this.player[2]-.27,.54,.54,1.7,'You','player','Your position in the 3D world.'));
 }
 private glyph(hit:Hit,p:Vec,col:number,row:number,night:boolean):[string,string]{
  const b=hit.box,n=hit.normal;let color=night?'#a7b2a0':'#41433e',glyph='.';
  if(this.mode==='depth'){const v=Math.max(30,Math.min(210,Math.round((hit.t-35)*2.4)));return ['#',`rgb(${v},${v},${v})`];}
  if(this.mode==='normals')return [n[1]?'_':n[0]?'|':'/',n[1]?'#63865a':n[0]?'#b36850':'#557aa2'];
  if(!b){
   const x=Math.abs(p[0]),z=Math.abs(p[2]);const road=x<2.4||z<2.4||(x>19&&x<23)||(z>19&&z<23);
   if(road){glyph=' ';if(((x<.12||Math.abs(x-21)<.12)&&mod(p[2],3)<1.6)||((z<.12||Math.abs(z-21)<.12)&&mod(p[0],3)<1.6))glyph='-';
    if((x<2.4&&z>16&&z<18)||(z<2.4&&x>16&&x<18))glyph=mod(x<2.4?p[0]:p[2],.8)<.38?'=':' ';
   }else if(x>24||z>24){glyph=mod(p[0]+p[2],1)<.16?'.':' ';color=night?'#53664e':'#aeb69c';}
   else {glyph=mod(p[0],1)<.09||mod(p[2],1)<.09?'+':'.';color=night?'#52614e':'#b6baa7';}
   return [glyph,color];
  }
  if(b.kind==='player')return ['@',night?'#ffc66a':'#b16b1e'];
  if(b.kind==='person')return [p[1]>1.1?'o':'i',night?'#c2c7b4':'#455c43'];
  if(b.kind==='car')return [n[1]?'=':n[0]?'|':'/',night?'#ced8be':'#495b44'];
  const brightness=Math.max(0,dot(n,[-.5,.8,.32]));
  color=night?'#84947d':brightness>.6?'#7a856b':brightness>.15?'#65735a':'#44523f';
  if(n[1]){
   const edge=Math.min(p[0]-b.min[0],b.max[0]-p[0],p[2]-b.min[2],b.max[2]-p[2]);
   glyph=edge<.18?'_':(row+col)%11===0?'.':' ';
   if(b.kind==='roof')glyph=n[1]?'=':'|';
  }else{
   const u=n[0]?p[2]-b.min[2]:p[0]-b.min[0];
   const window=mod(u,2)<1.0&&mod(p[1],2.7)>.9&&mod(p[1],2.7)<2;
   const edge=Math.min(u,(n[0]?b.max[2]-b.min[2]:b.max[0]-b.min[0])-u)<.2;
   if(edge)glyph='|';else if(p[1]<.2||b.max[1]-p[1]<.15)glyph='_';
   else if(window){glyph=' ';if(night&&mod(Math.floor(u/2)+Math.floor(p[1]/2.7),3)!==0){color='#d6a355';glyph='#';}}
   else glyph=(row+col)%3===0?'.':' ';
  }
  if(b.name===this.selectedName)color=night?'#e1b870':'#9b642d';
  return [glyph,color];
 }
 private render(){
  this.camera();this.depths.fill(Infinity);const ctx=this.ctx,night=this.clock>1080||this.clock<360;
  ctx.fillStyle=night?'#18221d':'#faf9f5';ctx.fillRect(0,0,this.width,this.height);ctx.font='11px "Courier New",monospace';ctx.textBaseline='top';
  for(let row=0;row<this.rows;row++)for(let col=0;col<this.columns;col++){
   const o=this.ray((col+.5)*this.cw,(row+.5)*this.ch),hit=this.trace(o);if(!hit)continue;this.depths[row*this.columns+col]=hit.t;
   const p:Vec=[o[0]+this.direction[0]*hit.t,o[1]+this.direction[1]*hit.t,o[2]+this.direction[2]*hit.t];
   const [g,color]=this.glyph(hit,p,col,row,night);if(g===' ')continue;ctx.fillStyle=color;ctx.fillText(g,col*this.cw,row*this.ch);
  }
  if(this.mode==='ink')this.drawDetails(night);
 }

 private project(p:Vec):[number,number,number]{
  const v:Vec=[p[0]-this.center[0],p[1]-this.center[1],p[2]-this.center[2]],scale=Math.min(this.width,this.height*1.35)/this.span;
  return [this.width/2+dot(v,this.right)*scale,this.height*.62-dot(v,this.up)*scale,dot(v,this.direction)];
 }
 private line(a:Vec,b:Vec,color:string){
  const p=this.project(a),q=this.project(b),dx=q[0]-p[0],dy=q[1]-p[1],steps=Math.ceil(Math.max(Math.abs(dx)/this.cw,Math.abs(dy)/this.ch)*1.3);
  const glyph=Math.abs(dy)<Math.abs(dx)*.22?'_':Math.abs(dx)<Math.abs(dy)*.3?'|':dx*dy>0?'\\':'/';
  this.ctx.fillStyle=color;
  for(let i=0;i<=steps;i++){const f=steps?i/steps:0,c=Math.floor((p[0]+dx*f)/this.cw),r=Math.floor((p[1]+dy*f)/this.ch),t=p[2]+(q[2]-p[2])*f;if(c<0||r<0||c>=this.columns||r>=this.rows)continue;
   if(t<=this.depths[r*this.columns+c]+.65)this.ctx.fillText(glyph,c*this.cw,r*this.ch);
  }
 }
 private outline(b:Box,color:string){
  const [x,y,z]=b.min,[X,Y,Z]=b.max;
  for(const h of [y,Y]){this.line([x,h,z],[X,h,z],color);this.line([X,h,z],[X,h,Z],color);this.line([X,h,Z],[x,h,Z],color);this.line([x,h,Z],[x,h,z],color);}
  for(const a of [x,X])for(const c of [z,Z])this.line([a,y,c],[a,Y,c],color);
 }
 private label(text:string,at:Vec,color:string,vertical=false){
  const p=this.project(at);this.ctx.fillStyle=color;
  for(let i=0;i<text.length;i++){const c=Math.floor(p[0]/this.cw)+(vertical?0:i),r=Math.floor(p[1]/this.ch)+(vertical?i:0);if(c>=0&&r>=0&&c<this.columns&&r<this.rows&&p[2]<this.depths[r*this.columns+c]+1.1)this.ctx.fillText(text[i],c*this.cw,r*this.ch);}
 }
 private drawDetails(night:boolean){
  const ink=night?'#bfbdad':'#44443f',faint=night?'#647166':'#b3b1a5';
  for(const b of this.objects){
   if(b.kind==='person'||b.kind==='player')continue;
   this.outline(b,ink);
   if(b.kind==='car'){const [x,,z]=b.min,[X,,Z]=b.max;const cabin:Box={...b,min:[x+.3,1,z+.3],max:[X-.3,1.55,Z-.3]};this.outline(cabin,ink);continue;}
   if(b.kind!=='building')continue;
   const [x,,z]=b.min,[X,h,Z]=b.max;
   // Window frames on all four façades, tested against the ray depth buffer.
   for(const side of [0,1,2,3]){
    const alongX=side<2,lo=alongX?x:z,hi=alongX?X:Z,plane=side===0?z:side===1?Z:side===2?x:X;
    const pt=(u:number,y:number):Vec=>alongX?[u,y,plane]:[plane,y,u];
    for(let y=2.7;y<h-1;y+=2.7)for(let u=lo+.8;u<hi-1.2;u+=2){
     const a=pt(u,y),b1=pt(u+1.1,y),c=pt(u+1.1,y+1.35),d=pt(u,y+1.35);
     this.line(a,b1,ink);this.line(b1,c,ink);this.line(c,d,ink);this.line(d,a,ink);this.line(pt(u+.55,y),pt(u+.55,y+1.35),faint);
    }
    this.line(pt(lo,h-.35),pt(hi,h-.35),ink);
    this.line(pt(lo,2.2),pt(hi,2.2),ink);
    // Ground-floor glazed shopfronts and doors.
    for(let u=lo+.6;u<hi-.7;u+=1.4){this.line(pt(u,.15),pt(u,1.9),ink);this.line(pt(u,.15),pt(Math.min(u+1.2,hi),.15),ink);}
   }
   const sign=b.name.includes('Hotel')?'HOTEL':b.name.includes('Radio')?'RADIO':b.name.includes('Records')?'RECORDS':b.name.includes('Paper')?'CAFE':b.name.includes('Maple')?'MAPLE':'';
   if(sign)this.label(sign,[X+.12,Math.min(h-1,7.8),Z+.12],night?'#d7ac68':'#7d5740',true);
   // Roof rails and a small aerial.
   this.line([x+.5,h+.7,z+.5],[x+.5,h+2.2,z+.5],ink);this.line([x-.2,h+1.7,z+.5],[x+1.2,h+1.7,z+.5],ink);
  }
  // Paved sidewalk edges, curb joints and crossing stripes.
  for(const a of [-19,-17,-2.7,2.7,17,19]){
   this.line([a,.02,-24],[a,.02,24],faint);this.line([-24,.02,a],[24,.02,a],faint);
  }
  for(let a=-24;a<24;a+=1.1)for(const b of [-18,18]){this.line([a,.03,b-.8],[a,.03,b+.8],faint);this.line([b-.8,.03,a],[b+.8,.03,a],faint);}
  for(const x of [-18,18])for(const z of [-18,-1,18]){
   this.line([x,0,z],[x,3.7,z],ink);this.line([x,3.7,z],[x+.7,3.7,z],ink);this.label('*',[x+.7,3.7,z],night?'#e3b864':ink);
  }
  if(this.path.length){const dest=this.path[this.path.length-1];this.label('+',[dest[0],.1,dest[2]],'#bb642c');}
  // An intentional HUD marker remains visible through buildings.
  const p=this.project([this.player[0],1.8,this.player[2]]);
  this.ctx.font='bold 17px "Courier New",monospace';this.ctx.fillStyle=night?'#ffc16f':'#b35325';this.ctx.fillText('@',p[0]-5,p[1]-9);
  this.ctx.font='11px "Courier New",monospace';this.ctx.fillText('YOU',p[0]-10,p[1]-23);
 }
 private tick=(now:number)=>{
  const dt=this.prev?Math.min((now-this.prev)/1000,.05):0;this.prev=now;
  this.simulate(dt);this.render();this.frames++;
  if(now-this.reportAt>500){const h=Math.floor(this.clock/60),m=Math.floor(this.clock%60);this.report({time:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'),fps:Math.round(this.frames*1000/(now-this.reportAt)),cells:this.columns*this.rows,selected:this.selected});this.frames=0;this.reportAt=now;}
  this.frame=requestAnimationFrame(this.tick);
 };
 destroy(){this.canvas.removeEventListener('pointerdown',this.pointerdown);this.canvas.removeEventListener('pointermove',this.pointermove);this.canvas.removeEventListener('pointerup',this.pointerup);this.canvas.removeEventListener('pointercancel',this.pointerup);cancelAnimationFrame(this.frame);this.observer.disconnect();window.removeEventListener('keydown',this.keydown);window.removeEventListener('keyup',this.keyup);window.removeEventListener('blur',this.blur);this.canvas.removeEventListener('wheel',this.wheel);this.canvas.removeEventListener('click',this.click);}
}
