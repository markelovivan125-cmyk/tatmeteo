(function(){
'use strict';

/* ══════════════════════════════════════════
   PANEL SHOW/HIDE
══════════════════════════════════════════ */
var hiddenPanels={};
function closePanel(id){var el=document.getElementById(id);if(el){el.style.display='none';hiddenPanels[id]=true}var rb=document.getElementById('restore-'+id);if(rb)rb.style.display='block';}
function restorePanel(id){var el=document.getElementById(id);if(el){var flexPanels={ctrl:1,tl:1};el.style.display=flexPanels[id]?'flex':'block';hiddenPanels[id]=false;}var rb=document.getElementById('restore-'+id);if(rb)rb.style.display='none';}
window.closePanel=closePanel;
window.restorePanel=restorePanel;

/* ══════════════════════════════════════════
   CONSTANTS & PALETTES
══════════════════════════════════════════ */
var SRC='https://rainradar.ru/composite';
var FZ=7; // Увеличено до 7 для максимального зума (1x1 км)
var MDBZ=5,DELAY=600,STEP=600;
var HISTORY_MINUTES=190,MAX_HISTORY_SEC=HISTORY_MINUTES*60,HISTORY_HOURS_LABEL='3ч 10мин';

var RPAL=[
  {v:80, r:[255, 0, 255], l:'80+ Экстремальное'},
  {v:70, r:[160, 0, 255], l:'70 Очень сильное'},
  {v:65, r:[100, 0, 255], l:'65 Град/Шквал'},
  {v:55, r:[255, 0, 0],   l:'55 Гроза 100%'},
  {v:50, r:[255, 80, 80], l:'50 Гроза 70%'},
  {v:40, r:[255, 170, 0], l:'40 Гроза 30%'},
  {v:35, r:[255, 230, 0], l:'35 Сильный ливень'},
  {v:30, r:[0, 255, 100], l:'30 Ливень'},
  {v:25, r:[0, 255, 200], l:'25 Слабый ливень'},
  {v:20, r:[0, 200, 255], l:'20 Умеренные осадки'},
  {v:15, r:[0, 150, 255], l:'15 Слабые осадки'},
  {v:6,  r:[0, 100, 200], l:'6 Облачность'}
];

var PPAL=[
  {v:95, r:[255, 255, 255], l:'Смерч'},
  {v:90, r:[255, 0, 80],    l:'Шквал сильный'},
  {v:85, r:[255, 50, 120],  l:'Шквал умеренный'},
  {v:80, r:[255, 100, 160], l:'Шквал слабый'},
  {v:75, r:[255, 0, 255],   l:'Град сильный'},
  {v:70, r:[200, 0, 255],   l:'Град умеренный'},
  {v:65, r:[150, 0, 255],   l:'Град слабый'},
  {v:55, r:[255, 100, 100], l:'Гроза >90%'},
  {v:50, r:[255, 150, 100], l:'Гроза 71-90%'},
  {v:40, r:[255, 200, 100], l:'Гроза 30-70%'},
  {v:35, r:[0, 150, 255],   l:'Ливень сильный'},
  {v:30, r:[0, 200, 255],   l:'Ливень умеренный'},
  {v:25, r:[0, 255, 255],   l:'Ливень слабый'},
  {v:20, r:[100, 255, 150], l:'Осадки сильные'},
  {v:15, r:[150, 255, 100], l:'Осадки умеренные'},
  {v:6,  r:[200, 255, 50],  l:'Осадки слабые'},
  {v:0,  r:[150, 200, 255], l:'Облака'}
];

var SCALES = [
  { px: 1, label: '1км' }, // 1x1 км
  { px: 2, label: '2км' }, // 2x2 км
  { px: 4, label: '4км' }  // 4x4 км
];
var scaleIdx = 0;

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
var S={ts:0,px:SCALES[0].px,layer:'rr-radar',playing:false,timer:null,speedI:0,speeds:[1,2,4],frameI:0,frames:[],
cache:new Map(),pending:new Set(),failed:new Set(),cacheMax:400,loadN:0,manualTime:false,legendVis:true};
function nowTs(){return Math.floor((Date.now()/1000-DELAY)/STEP)*STEP}
function minTs(){return nowTs()-MAX_HISTORY_SEC}
S.ts=nowTs();
function setTime(t,m){S.ts=Math.max(minTs(),Math.min(t,nowTs()));S.manualTime=!!m}
var $=function(id){return document.getElementById(id)};

/* ══════════════════════════════════════════
   MAP & BASE LAYER (CartoDB Dark)
══════════════════════════════════════════ */
var map=L.map('map',{
  center:[55.75, 37.61], // Москва
  zoom:6,
  minZoom:4,
  maxZoom:15, // Максимальный зум (1x1 км детализация)
  zoomControl:false,
  fadeAnimation:false,
  markerZoomAnimation:false,
  scrollWheelZoom:true,
  doubleClickZoom:false,
  boxZoom:false,
  touchZoom:true,
  keyboard:false
});

// Официальная темная карта CartoDB Dark Matter
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd',
  maxZoom: 20,
  detectRetina: true
}).addTo(map);

var canvas=$('radar'),ctx=canvas.getContext('2d');
function resizeCanvas(){canvas.width=innerWidth;canvas.height=innerHeight;schedRender()}
addEventListener('resize',resizeCanvas);resizeCanvas();

/* ══════════════════════════════════════════
   RAINVIEWER LOGIC (ONLY SAT)
══════════════════════════════════════════ */
var rvSatLayer = null, rvMeta = null;

async function fetchRainViewerMeta() {
    $('pulse').classList.add('busy');
    try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        rvMeta = await res.json();
        
        var frames = [];
        if (rvMeta.satellite && rvMeta.satellite.past) {
            rvMeta.satellite.past.forEach(f => frames.push(f.time));
        }
        S.frames = frames;
        
        if (S.frames.length > 0) {
            S.ts = S.frames[S.frames.length-1];
            buildFramesUI();
            updateRVLayer();
        }
    } catch(e) {
        toast('⚠️ Ошибка RainViewer API');
    } finally {
        $('pulse').classList.remove('busy');
    }
}

function updateRVLayer() {
    if (!rvMeta || S.frames.length === 0) return;
    
    var arr = rvMeta.satellite.past.slice();
    var closest = arr.reduce(function(prev, curr) {
        return (Math.abs(curr.time - S.ts) < Math.abs(prev.time - S.ts) ? curr : prev);
    });
    S.ts = closest.time;
    
    var url = `https://tilecache.rainviewer.com${closest.path}/256/{z}/{x}/{y}/0/1_1.png`;
    
    if (rvSatLayer) map.removeLayer(rvSatLayer);
    rvSatLayer = L.tileLayer(url, { opacity: 0.85, tileSize: 256, zIndex: 400 }).addTo(map);
    
    $('dbg').textContent = '⏱ ' + new Date(S.ts*1000).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}) + ' | RV-SAT';
    updThumb();
}

/* ══════════════════════════════════════════
   RAINRADAR LOGIC
══════════════════════════════════════════ */
function lon2x(lon,z){return Math.floor((lon+180)/360*(1<<z))}
function lat2y(lat,z){var r=lat*Math.PI/180;return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*(1<<z))}
function x2lon(x,z){return x/(1<<z)*360-180}
function y2lat(y,z){var n=Math.PI-2*Math.PI*y/(1<<z);return 180/Math.PI*Math.atan(.5*(Math.exp(n)-Math.exp(-n)))}
function visTiles(){var b=map.getBounds(),mx=(1<<FZ)-1,x0=Math.max(0,lon2x(b.getWest(),FZ)),x1=Math.min(mx,lon2x(b.getEast(),FZ)),
y0=Math.max(0,lat2y(b.getNorth(),FZ)),y1=Math.min(mx,lat2y(b.getSouth(),FZ)),l=[];for(var x=x0;x<=x1;x++)for(var y=y0;y<=y1;y++)l.push({x:x,y:y});return l}
function tileRect(x,y){var nw=map.latLngToContainerPoint(L.latLng(y2lat(y,FZ),x2lon(x,FZ))),
se=map.latLngToContainerPoint(L.latLng(y2lat(y+1,FZ),x2lon(x+1,FZ)));return{sx:Math.round(nw.x),sy:Math.round(nw.y),sw:Math.round(se.x-nw.x),sh:Math.round(se.y-nw.y)}}
function makeCK(l,t,p,x,y){return l+'|'+t+'|'+p+'|'+x+'|'+y}
function CK(x,y){return makeCK(S.layer,S.ts,S.px,x,y)}
function getColor(raw,layer){var pal=layer==='rr-radar'?RPAL:PPAL;for(var i=0;i<pal.length;i++)if(raw>=pal[i].v)return pal[i].r;return null}

function processTile(img,layer,px){
  var src=document.createElement('canvas');src.width=src.height=256;var sc=src.getContext('2d');sc.drawImage(img,0,0);
  var id=sc.getImageData(0,0,256,256),d=id.data,out=document.createElement('canvas');out.width=out.height=256;var oc=out.getContext('2d');oc.imageSmoothingEnabled=false;
  if(px===1){for(var i=0;i<d.length;i+=4){if(!d[i+3])continue;var v=(d[i]+d[i+1]+d[i+2])/3|0,rgb=getColor(v,layer);
  if(rgb){d[i]=rgb[0];d[i+1]=rgb[1];d[i+2]=rgb[2];d[i+3]=220}else d[i+3]=0}oc.putImageData(id,0,0);return out}
  var bw=Math.ceil(256/px),bh=Math.ceil(256/px);
  for(var py=0;py<bh;py++)for(var pxx=0;pxx<bw;pxx++){var sum=0,n=0,x0=pxx*px,y0=py*px,x1=Math.min(x0+px,256),y1=Math.min(y0+px,256);
  for(var yy=y0;yy<y1;yy++)for(var xx=x0;xx<x1;xx++){var ii=(yy*256+xx)*4;if(d[ii+3]>0){sum+=(d[ii]+d[ii+1]+d[ii+2])/3;n++}}
  if(n>0){var rgb=getColor(Math.floor(sum/n),layer);if(rgb){oc.fillStyle='rgb('+rgb+')';oc.fillRect(x0,y0,x1-x0,y1-y0)}}}return out}

function bumpLoad(d){S.loadN=Math.max(0,S.loadN+d);$('pulse').classList.toggle('busy',S.loadN>0)}
function fetchTile(x,y){var ck=CK(x,y);if(S.cache.has(ck)||S.pending.has(ck)||S.failed.has(ck))return;
S.pending.add(ck);bumpLoad(1);var url=SRC+'/'+S.ts+'/'+FZ+'/'+x+'_'+y+'.png',img=new Image();img.crossOrigin='anonymous';
var spx=S.px,sl=S.layer,sts=S.ts,tid=setTimeout(function(){S.pending.delete(ck);bumpLoad(-1);S.failed.add(ck)},8000);
img.onload=function(){clearTimeout(tid);S.pending.delete(ck);bumpLoad(-1);if(S.ts!==sts||S.layer!==sl)return;
try{var r=processTile(img,sl,spx);if(S.cache.size>=S.cacheMax)S.cache.delete(S.cache.keys().next().value);S.cache.set(ck,r)}catch(e){S.failed.add(ck)}schedRender()};
img.onerror=function(){clearTimeout(tid);S.pending.delete(ck);bumpLoad(-1);S.failed.add(ck)};img.src=url}

/* ══════════════════════════════════════════
   RENDER (CANVAS)
══════════════════════════════════════════ */
var renderPend=false;
function schedRender(){if(!renderPend){renderPend=true;requestAnimationFrame(doRender)}}
function doRender(){
  renderPend=false;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  
  if (S.layer === 'rv-sat') {
    $('dbg').textContent = '⏱ ' + new Date(S.ts*1000).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}) + ' | RV-SAT';
    return;
  }

  var tiles=visTiles(),hit=0,miss=0;
  ctx.imageSmoothingEnabled = false; 
  for(var i=0;i<tiles.length;i++){var t=tiles[i],ck=CK(t.x,t.y),c=S.cache.get(ck);
  if(c){var r=tileRect(t.x,t.y);if(r.sw>0&&r.sh>0){
  ctx.globalAlpha=.9;ctx.drawImage(c,r.sx,r.sy,r.sw,r.sh);ctx.globalAlpha=1;hit++}}else{fetchTile(t.x,t.y);miss++}}
  $('dbg').textContent='⏱ '+new Date(S.ts*1000).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})+' | 🟦'+hit+' 🟥'+miss;

  // Отрисовка сетки масштаба
  ctx.save();ctx.strokeStyle='rgba(255,255,255,.28)';ctx.lineWidth=1;ctx.beginPath();
  for(var gi=0;gi<tiles.length;gi++){var gt=tiles[gi],gr=tileRect(gt.x,gt.y);if(gr.sw<=0||gr.sh<=0)continue;
  var scX=gr.sw/256,scY=gr.sh/256,bW=S.px*scX,bH=S.px*scY;if(bW<1||bH<1)continue;var cols=Math.ceil(256/S.px);
  for(var ci=0;ci<=cols;ci++){var lx=gr.sx+Math.round(ci*bW)+.5;ctx.moveTo(lx,gr.sy);ctx.lineTo(lx,gr.sy+gr.sh)}
  for(var ri=0;ri<=cols;ri++){var ly=gr.sy+Math.round(ri*bH)+.5;ctx.moveTo(gr.sx,ly);ctx.lineTo(gr.sx+gr.sw,ly)}}ctx.stroke();ctx.restore();
}

map.on('move',schedRender);map.on('moveend zoomend',function(){if(S.layer.startsWith('rr'))S.failed.clear();schedRender()});

/* ══════════════════════════════════════════
   PIXEL POPUP (CLICK)
══════════════════════════════════════════ */
var popupEl=$('pixel-popup');
var popupVisible=false;

function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function findPalEntry(r,g,b){var pal=S.layer==='rr-radar'?RPAL:PPAL,best=null,bd=1e9;
for(var i=0;i<pal.length;i++){var p=pal[i],dr=r-p.r[0],dg=g-p.r[1],db=b-p.r[2],d=dr*dr+dg*dg+db*db;if(d<bd){bd=d;best=p}}
return bd<3000?{label:best.l,v:best.v,layer:S.layer}:null}
function getBlockAt(mx,my){var tiles=visTiles();for(var i=0;i<tiles.length;i++){var t=tiles[i],r=tileRect(t.x,t.y);
if(r.sw<=0||r.sh<=0||mx<r.sx||mx>=r.sx+r.sw||my<r.sy||my>=r.sy+r.sh)continue;
var ck=CK(t.x,t.y),tc=S.cache.get(ck);if(!tc)return null;var px=S.px,
oxF=Math.max(0,Math.min(255.9,(mx-r.sx)/r.sw*256)),oyF=Math.max(0,Math.min(255.9,(my-r.sy)/r.sh*256)),
bx=Math.floor(oxF/px)*px,by=Math.floor(oyF/px)*px,bx2=Math.min(bx+px,256),by2=Math.min(by+px,256),cx2=(bx+bx2)/2|0,cy2=(by+by2)/2|0;
try{var pd=tc.getContext('2d').getImageData(cx2,cy2,1,1).data;if(!pd[3])return null;
var scX=r.sw/256,scY=r.sh/256;return{sx:r.sx+Math.round(bx*scX),sy:r.sy+Math.round(by*scY),
sw:Math.max(4,Math.round(px*scX)),sh:Math.max(4,Math.round(px*scY)),color:'rgb('+pd[0]+','+pd[1]+','+pd[2]+')',
r:pd[0],g:pd[1],b:pd[2],info:findPalEntry(pd[0],pd[1],pd[2]),tileX:t.x,tileY:t.y,blockX:bx,blockY:by}}catch(e){return null}}return null}

function showPopup(block,mx,my){var info=block.info,lbl=info?escHtml(info.label):'—',
meta=info?(info.layer==='rr-radar'?'Слой: <b>Отражаемость</b><br>Порог: ≥'+info.v+' dBZ':'Слой: <b>Явления</b><br>'+escHtml(info.label)):'Нет данных';
popupEl.innerHTML='<div class="popup-header"><div class="popup-swatch" style="background:'+block.color+'"></div><div class="popup-label">'+lbl+'</div></div><div class="popup-meta">'+meta+'</div><span class="popup-close" onclick="document.getElementById(\'pixel-popup\').style.display=\'none\'">✕</span>';
popupEl.style.display='block';popupEl.classList.remove('popup-in');void popupEl.offsetWidth;popupEl.classList.add('popup-in');
var px2=mx+16,py2=my-55;if(px2+230>innerWidth-8)px2=mx-246;if(py2<8)py2=8;if(py2+110>innerHeight-8)py2=innerHeight-118;
popupEl.style.left=px2+'px';popupEl.style.top=py2+'px';popupVisible=true}
function hidePopup(){popupEl.style.display='none';popupVisible=false}

map.on('click',function(e){
    if (S.layer !== 'rr-radar' && S.layer !== 'rr-wx') return;
    var p=e.containerPoint,block=getBlockAt(p.x,p.y);
    if(block) showPopup(block,p.x,p.y); else hidePopup();
});

/* ══════════════════════════════════════════
   SCALE CHANGER (1km -> 2km -> 4km)
══════════════════════════════════════════ */
function cycleScale() {
    if (S.layer === 'rv-sat') return;
    scaleIdx = (scaleIdx + 1) % SCALES.length;
    S.px = SCALES[scaleIdx].px;
    $('btn-scale').textContent = '📏 ' + SCALES[scaleIdx].label;
    S.cache.clear(); S.pending.clear(); S.failed.clear();
    forceRefresh();
}
 $('btn-scale').addEventListener('click', cycleScale);

/* ══════════════════════════════════════════
   SNAPSHOT GENERATOR (Скачивание с картой)
══════════════════════════════════════════ */
async function loadTileForCV(tx, ty, z, url, processFunc) {
    return new Promise(function(resolve) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            if (processFunc) {
                try { resolve(processFunc(img, S.layer, S.px)); } catch(e) { resolve(null); }
            } else {
                resolve(img);
            }
        };
        img.onerror = function() { resolve(null); };
        img.src = url;
    });
}

async function generateRFSnapshot() {
    toast('⏳ Генерация снимка РФ...');
    $('pulse').classList.add('busy');
    
    var z = 6; // Уменьшено до 6, чтобы РФ влезло целиком
    var x0 = lon2x(19.0, z);
    var x1 = lon2x(180.0, z);
    var y0 = lat2y(77.5, z);
    var y1 = lat2y(41.0, z);
    
    var cols = x1 - x0 + 1;
    var rows = y1 - y0 + 1;
    
    var cv = document.createElement('canvas');
    cv.width = cols * 256;
    cv.height = rows * 256;
    var cctx = cv.getContext('2d');
    cctx.fillStyle = '#0a0a0a'; 
    cctx.fillRect(0, 0, cv.width, cv.height);
    
    var promises = [];
    
    for (var x = x0; x <= x1; x++) {
        for (var y = y0; y <= y1; y++) {
            (function(tx, ty) {
                var drawX = (tx - x0) * 256;
                var drawY = (ty - y0) * 256;
                
                var pBase = loadTileForCV(tx, ty, z, 'https://mt0.google.com/vt/lyrs=m&style=3&x=' + tx + '&y=' + ty + '&z=' + z).then(function(img) {
                    if (img) cctx.drawImage(img, drawX, drawY);
                });
                
                var url;
                var pFunc = null;
                if (S.layer.startsWith('rr-')) {
                    url = SRC + '/' + S.ts + '/' + z + '/' + tx + '_' + ty + '.png';
                    pFunc = processTile;
                } else if (S.layer === 'rv-sat' && rvMeta) {
                    var arr = rvMeta.satellite.past.slice();
                    var closest = arr.reduce(function(p, c) { return (Math.abs(c.time - S.ts) < Math.abs(p.time - S.ts) ? c : p); });
                    url = 'https://tilecache.rainviewer.com' + closest.path + '/256/' + z + '/' + tx + '/' + ty + '/0/1_1.png';
                }
                
                var pRadar = loadTileForCV(tx, ty, z, url, pFunc).then(function(procCv) {
                    if (procCv) cctx.drawImage(procCv, drawX, drawY);
                });
                
                promises.push(Promise.all([pBase, pRadar]));
            })(x, y);
        }
    }
    
    await Promise.all(promises);
    $('pulse').classList.remove('busy');
    
    cv.toBlob(function(blob) {
        if (!blob) { toast('❌ Ошибка генерации (CORS?)'); return; }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'radar_rf_map_' + S.layer + '_' + S.ts + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast('✅ Снимок сохранен');
    }, 'image/png');
}

 $('btn-snapshot').addEventListener('click', generateRFSnapshot);

/* ══════════════════════════════════════════
   GIF GENERATOR (Таймлапс ЕРФ)
══════════════════════════════════════════ */
async function generateGIF() {
    toast('⏳ Генерация GIF (может занять время)...');
    $('pulse').classList.add('busy');
    
    var z = 6;
    // Границы Европейской части РФ (приблизительно)
    var x0 = lon2x(25.0, z);
    var x1 = lon2x(65.0, z);
    var y0 = lat2y(70.0, z);
    var y1 = lat2y(40.0, z);
    
    var cols = x1 - x0 + 1;
    var rows = y1 - y0 + 1;
    
    var gif = new GIF({
        workers: 2,
        quality: 10,
        width: cols * 256,
        height: rows * 256,
        workerScript: 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js'
    });
    
    // Берем последние 2 часа (12 кадров по 10 минут)
    var framesToRender = S.frames.slice(-12).slice().reverse(); // От старых к новым
    
    for (var f = 0; f < framesToRender.length; f++) {
        var fTs = framesToRender[f];
        var cv = document.createElement('canvas');
        cv.width = cols * 256;
        cv.height = rows * 256;
        var cctx = cv.getContext('2d');
        cctx.fillStyle = '#0a0a0a';
        cctx.fillRect(0, 0, cv.width, cv.height);
        
        var promises = [];
        
        for (var x = x0; x <= x1; x++) {
            for (var y = y0; y <= y1; y++) {
                (function(tx, ty, cTs) {
                    var drawX = (tx - x0) * 256;
                    var drawY = (ty - y0) * 256;
                    
                    var url;
                    var pFunc = null;
                    if (S.layer.startsWith('rr-')) {
                        url = SRC + '/' + cTs + '/' + z + '/' + tx + '_' + ty + '.png';
                        pFunc = processTile;
                    } else if (S.layer === 'rv-sat' && rvMeta) {
                        var arr = rvMeta.satellite.past.slice();
                        var closest = arr.reduce(function(p, c) { return (Math.abs(c.time - cTs) < Math.abs(p.time - cTs) ? c : p); });
                        url = 'https://tilecache.rainviewer.com' + closest.path + '/256/' + z + '/' + tx + '/' + ty + '/0/1_1.png';
                    }
                    
                    var p = loadTileForCV(tx, ty, z, url, pFunc).then(function(img) {
                        if (img) cctx.drawImage(img, drawX, drawY);
                    });
                    promises.push(p);
                })(x, y, fTs);
            }
        }
        
        await Promise.all(promises);
        gif.addFrame(cv, {delay: 300});
        toast('⏳ Рендер GIF: кадр ' + (f + 1) + '/' + framesToRender.length);
    }
    
    gif.on('finished', function(blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'timelapse_erf_' + S.layer + '.gif';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        $('pulse').classList.remove('busy');
        toast('✅ GIF сохранен');
    });
    
    gif.render();
}

 $('btn-gif').addEventListener('click', generateGIF);

/* ══════════════════════════════════════════
   TIMELINE UI
══════════════════════════════════════════ */
function buildFrames() {
    if (S.layer === 'rv-sat') return;
    var mx=nowTs(),from=mx-MAX_HISTORY_SEC,frames=[];for(var t=from;t<=mx;t+=STEP)frames.push(t);
    S.frames=frames;
    buildFramesUI();
}

function buildFramesUI() {
    var el=$('tlbls');el.innerHTML='';
    if(!S.frames.length) return;
    for(var i=0;i<5;i++){
        var idx=Math.round(i/4*(S.frames.length-1));
        if(idx>=S.frames.length) idx=S.frames.length-1;
        var s=document.createElement('span');
        s.textContent=new Date(S.frames[idx]*1000).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
        el.appendChild(s);
    }
    updThumb();
}

function updThumb(){var f=S.frames;if(!f.length)return;var r=f[f.length-1]-f[0],p=r===0?0:Math.max(0,Math.min(1,(S.ts-f[0])/r));
 $('tfill').style.width=p*100+'%';$('tthumb').style.left=p*100+'%'}

var drag=false,timeTooltip=$('time-tooltip');
function tsFromX(cx){var r=$('track').getBoundingClientRect();var p=Math.max(0,Math.min(1,(cx-r.left)/r.width));var idx=Math.round(p*(S.frames.length-1));return S.frames[idx]||S.ts}
function pctFromX(cx){var r=$('track').getBoundingClientRect();return Math.max(0,Math.min(1,(cx-r.left)/r.width))*100}
function formatTimeDiff(ts){var now=Math.floor(Date.now()/1000),diff=ts-now,ad=Math.abs(diff);if(ad<120)return{text:'сейчас',cls:'now'};
var mins=Math.round(ad/60),hours=Math.floor(mins/60),rm=mins%60,text='';
if(hours>0){text=hours+'ч';if(rm>0)text+=' '+rm+'м'}else text=mins+'м';
return diff<0?{text:'−'+text+' назад',cls:'past'}:{text:'+'+text+' вперёд',cls:'future'}}
function showTimeTooltip(ts,pct){var d=new Date(ts*1000),ts2=d.toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),
ds=d.toLocaleDateString('ru',{day:'2-digit',month:'short'}),
