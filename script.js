(function(){
'use strict';

var hiddenPanels={};
function closePanel(id){var el=document.getElementById(id);if(el){el.style.display='none';hiddenPanels[id]=true}var rb=document.getElementById('restore-'+id);if(rb)rb.style.display='block';}
function restorePanel(id){var el=document.getElementById(id);if(el){var flexPanels={ctrl:1,tl:1};el.style.display=flexPanels[id]?'flex':'block';hiddenPanels[id]=false;}var rb=document.getElementById('restore-'+id);if(rb)rb.style.display='none';}
window.closePanel=closePanel;
window.restorePanel=restorePanel;

var wms_url = "/baltrad_wsgi";
var wms_tools_url = "/baltrad_tools_wsgi";
var BALTRAD_LAYERS = ["rain_l3", "rain_l2", "pgm_l3"]; 
var layer_idx = 0; 
var WMS_TOKEN = null;
var LEGEND_BASE_URL = null;

var S={ts:0,playing:false,timer:null,speedI:0,speeds:[1,2,4],frameI:0,frames:[],legendVis:true};
var $=function(id){return document.getElementById(id)};

function toast(m){var el=$('dbg');el.style.color='#7ab4ff';el.textContent=m;setTimeout(function(){el.style.color='';},3000)}

var map=L.map('map',{
  center:[55.6,37.4], 
  zoom:6,
  minZoom:4,
  maxZoom:9,
  zoomControl:false,
  fadeAnimation:false,
  markerZoomAnimation:false,
  scrollWheelZoom:true,
  doubleClickZoom:false,
  boxZoom:false,
  touchZoom:true,
  keyboard:false
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd',
  maxZoom: 20,
  detectRetina: true
}).addTo(map);

var wmsLayer = null;

async function refreshToken() {
    try {
        const res = await fetch("/get_token");
        if (!res.ok) return;
        const data = await res.json();
        WMS_TOKEN = data.token;
        refreshLegend();
        if (wmsLayer) updateWMSTime(); 
    } catch(e) {
        $('url-debug').textContent = "Ошибка получения токена: " + e.message;
    }
}
setInterval(refreshToken, 30000); 

function refreshLegend() {
    if (!LEGEND_BASE_URL || !WMS_TOKEN) return;
    const img = $('legend-img');
    const newUrl = LEGEND_BASE_URL + "&token=" + encodeURIComponent(WMS_TOKEN);
    if (img.dataset.lastUrl !== newUrl) {
        img.src = newUrl;
        img.dataset.lastUrl = newUrl;
    }
}

function initWMSLayer() {
    if (wmsLayer) map.removeLayer(wmsLayer);
    
    wmsLayer = L.tileLayer.wms(wms_url, {
        layers: BALTRAD_LAYERS[layer_idx],
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        crs: L.CRS.EPSG4326, 
        opacity: 0.75,
        tileSize: 256
    }).addTo(map);
    
    updateWMSTime();
}

function updateWMSTime() {
    if (!wmsLayer || S.frames.length === 0) return;
    var d = new Date(S.ts * 1000);
    var isoTime = d.toISOString(); 
    
    wmsLayer.setParams({ TIME: isoTime, token: WMS_TOKEN || "" });
    
    var d2 = new Date(S.ts * 1000);
    $('dbg').textContent = '⏱ ' + d2.toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}) + ' | ' + BALTRAD_LAYERS[layer_idx];
}

async function fetchWMSMeta() {
    if (!WMS_TOKEN) return;
    $('pulse').classList.add('busy');
    const url = `${wms_url}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities&token=${encodeURIComponent(WMS_TOKEN)}`;
    
    try {
        const res = await fetch(url);
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, "text/xml");
        let times = [];
        
        const allLayers = doc.querySelectorAll("Layer");
        allLayers.forEach(l => {
            const nameEl = l.querySelector("Name");
            if (!nameEl) return;
            const name = nameEl.textContent.split(",")[0];
            
            if (name === BALTRAD_LAYERS[layer_idx].split(",")[0]) {
                const extent = l.querySelector("Extent[name='time']");
                if (extent) times = extent.textContent.split(",");
                
                const legendEl = l.querySelector("LegendURL OnlineResource");
                if (legendEl) {
                    LEGEND_BASE_URL = legendEl.getAttribute('xlink:href') || legendEl.getAttribute('http://www.w3.org/1999/xlink href') || legendEl.getAttribute('href');
                    if (LEGEND_BASE_URL && LEGEND_BASE_URL.startsWith('http://')) {
                        LEGEND_BASE_URL = LEGEND_BASE_URL.replace('http://','https://');
                    }
                }
            }
        });

        S.frames = times.map(t => {
            if (!t) return NaN;
            if (t.endsWith('Z')) return Math.floor(new Date(t).getTime() / 1000);
            return Math.floor(new Date(t + 'Z').getTime() / 1000);
        }).filter(t => !isNaN(t));
        
        if (S.frames.length > 0) {
            S.ts = S.frames[S.frames.length - 1]; 
            buildFramesUI();
            updateWMSTime();
            refreshLegend();
        } else {
            toast('⚠️ Нет доступных кадров');
        }
    } catch(e) {
        $('url-debug').textContent = "Ошибка GetCapabilities: " + e.message;
    } finally {
        $('pulse').classList.remove('busy');
    }
}

function toggleLayer(){
    layer_idx = (layer_idx + 1) % BALTRAD_LAYERS.length;
    var display_name = BALTRAD_LAYERS[layer_idx].replace('_l3','').replace('_l2','').toUpperCase();
    $('btn-layer').textContent = 'Слой: ' + display_name;
    initWMSLayer();
    fetchWMSMeta();
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
ds=d.toLocaleDateString('ru',{day:'2-digit',month:'short'}),di=formatTimeDiff(ts);
timeTooltip.innerHTML='<div class="tt-time">'+ts2+'</div><div class="tt-date">'+ds+'</div><div class="tt-diff '+di.cls+'">'+di.text+'</div>';
timeTooltip.style.left=pct+'%';timeTooltip.classList.add('visible')}
function hideTimeTooltip(){timeTooltip.classList.remove('visible')}

 $('track').addEventListener('pointerdown',function(e){if(!S.frames.length)return;drag=true;var ts=tsFromX(e.clientX),pct=pctFromX(e.clientX);S.ts=ts;updateWMSTime();showTimeTooltip(ts,pct);this.setPointerCapture(e.pointerId)});
 $('track').addEventListener('pointermove',function(e){if(drag){var ts=tsFromX(e.clientX),pct=pctFromX(e.clientX);S.ts=ts;updateWMSTime();showTimeTooltip(ts,pct)}});
document.addEventListener('pointerup',function(){if(drag){drag=false;hideTimeTooltip()}});
 $('track').addEventListener('mousemove',function(e){if(!drag&&S.frames.length)showTimeTooltip(tsFromX(e.clientX),pctFromX(e.clientX))});
 $('track').addEventListener('mouseleave',function(){if(!drag)hideTimeTooltip()});

function animMs(){return 900/S.speeds[S.speedI]}
function togglePlay(){S.playing?stopPlay():startPlay()}
function startPlay(){if(!S.frames.length)return;S.frameI=0;S.timer=setInterval(function(){S.frameI=(S.frameI+1)%S.frames.length;S.ts=S.frames[S.frameI];updateWMSTime()},animMs());S.playing=true;$('playbtn').innerHTML='&#x25A0;'}
function stopPlay(){clearInterval(S.timer);S.timer=null;S.playing=false;$('playbtn').innerHTML='&#x25B6;'}
function cycleSpeed(){S.speedI=(S.speedI+1)%S.speeds.length;$('spd').textContent=S.speeds[S.speedI]+'x';if(S.playing){stopPlay();startPlay()}}

function shiftTs(secondsDelta) {
    stopPlay();
    if(!S.frames.length) return;
    var targetTs = S.ts + secondsDelta;
    var closest = S.frames.reduce(function(prev, curr) {
        return (Math.abs(curr - targetTs) < Math.abs(prev - targetTs) ? curr : prev);
    });
    if (closest === S.ts) {
        toast('⚠️ Достигнут предел истории');
        return;
    }
    S.ts = closest;
    updateWMSTime();
    toast('⏱ ' + new Date(S.ts*1000).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}));
}

function doRefresh() {
    toast('Обновление...');
    refreshToken().then(() => {
        fetchWMSMeta();
    });
}

function toggleLegend(){var lg=$('legend'),btn=$('toggle-legend-btn');if(S.legendVis){lg.classList.add('collapsed');btn.innerHTML='+'}else{lg.classList.remove('collapsed');btn.innerHTML='−'}S.legendVis=!S.legendVis}

map.on('click', function(e) {
    if (!wmsLayer || !WMS_TOKEN) return;
    
    var url = wmsLayer.getFeatureInfoUrl(
        e.latlng,
        map.getSize(),
        map.getZoom(),
        {
            'INFO_FORMAT': 'text/html',
            'token': WMS_TOKEN || ""
        }
    );
    
    $('url-debug').textContent = "FeatureInfo URL: " + url;
        
    fetch(url)
        .then(r => r.text())
        .then(html => {
            if (html && html.trim().length > 0 && html.indexOf("Search results") === -1) {
                L.popup({maxWidth: 300})
                    .setLatLng(e.latlng)
                    .setContent(html)
                    .openOn(map);
            } else {
                L.popup({maxWidth: 250})
                    .setLatLng(e.latlng)
                    .setContent('<b>Нет данных</b><br>В этой точке отсутствует информация радара.')
                    .openOn(map);
            }
        })
        .catch(err => $('url-debug').textContent = "FeatureInfo Error: " + err.message);
});

var userLocationMarker = null, userLocationCircle = null;
 $('btn-locate').addEventListener('click', function() {
    map.locate({setView: true, maxZoom: 8, enableHighAccuracy: true});
});
map.on('locationfound', function(e) {
    if (userLocationMarker) map.removeLayer(userLocationMarker);
    if (userLocationCircle) map.removeLayer(userLocationCircle);
    userLocationMarker = L.marker(e.latlng).addTo(map).bindPopup("Вы здесь");
    userLocationCircle = L.circle(e.latlng, {
        radius: e.accuracy / 2,
        color: '#4a7fe8',
        fillColor: '#4a7fe8',
        fillOpacity: 0.15
    }).addTo(map);
});
map.on('locationerror', function() {
    toast('⚠️ Не удалось определить местоположение');
});

 $('playbtn').addEventListener('click',togglePlay);
 $('spd').addEventListener('click',cycleSpeed);
 $('btn-layer').addEventListener('click',toggleLayer);
 $('btn-refresh').addEventListener('click',doRefresh);
 $('b-minus1h').addEventListener('click',function(){shiftTs(-3600)});
 $('b-minus10m').addEventListener('click',function(){shiftTs(-600)});
 $('b-plus10m').addEventListener('click',function(){shiftTs(600)});
 $('toggle-legend-btn').addEventListener('click',function(e){e.stopPropagation();toggleLegend()});
 $('legend-header').addEventListener('click',toggleLegend);

async function init() {
    $('btn-layer').textContent = 'Слой: ' + BALTRAD_LAYERS[0].replace('_l3','').replace('_l2','').toUpperCase();
    $('dbg').textContent = 'Подключение к Baltrad...';
    
    await refreshToken();
    initWMSLayer();
    await fetchWMSMeta();
    
    setInterval(doRefresh, 300000);
}

init();

})();
