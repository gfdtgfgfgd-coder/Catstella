(async()=>{
 const api=window.dreamApi,$=id=>document.getElementById(id);let data=await api.get(),timer,panTimer,drag=null,draft=null;
 const original={...data.settings};let pending=Promise.resolve();
 function renderAsset(){const error=data.wallpaperError;$("wallpaper").hidden=!!error;$("enabled").disabled=!!error&&!data.settings.enabled;$("asset-status").textContent=error||"轻一点，工作更舒服。";}
 let packSignature="";
 function renderWallpapers(s){
  const list=data.wallpapers||[],select=$("wallpaperId");
  const signature=list.map(p=>p.id+(p.error?"!":"")+(p.active?"*":"")).join("|");
  if(signature!==packSignature){packSignature=signature;select.innerHTML="";
   for(const pack of list){const option=document.createElement("option");option.value=pack.id;option.textContent=pack.error?`${pack.name}（不可用：${pack.error}）`:pack.name+(pack.width?` · ${pack.width}×${pack.height}`:"");option.disabled=!!pack.error||!pack.previewUrl;select.append(option);}}
  const active=list.find(p=>p.active);
  if(active&&!active.error&&active.previewUrl)select.value=active.id;
  select.disabled=!list.some(p=>!p.error&&p.previewUrl);
  const img=$("wallpaper");
  if(active?.previewUrl&&!img.getAttribute("src").endsWith(active.previewUrl))img.src=active.previewUrl;
  $("footer-pack").textContent=active?active.name:"壁纸缺失";
  $("footer-dims").textContent=active&&active.width?`${active.width} × ${active.height} · 原图完整保留`:"把图片放入 assets/wallpapers 即可识别";
  const rotateMode=s.slideshow===false?"off":Number(s.slideshowIntervalMinutes)>15?"60":Number(s.slideshowIntervalMinutes)<=5?"5":"15";
  document.querySelectorAll("[data-rotate]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.rotate===rotateMode)));
 }
 function render(){const s={...data.settings,...draft};document.querySelectorAll("[data-output-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.outputMode===s.outputMode)));for(const key of ["positionX","positionY"])if(document.activeElement!==$(key))$(key).value=s[key];$("zoom").value=s.zoom*100;$("zoom-value").textContent=Math.round(s.zoom*100)+"%";renderPosition(s);$("opacity").value=s.opacity;$("opacity-value").textContent=s.opacity+"%";$("wallpaper").style.opacity=s.opacity/100;$("enabled").checked=s.enabled;if(document.activeElement!==$("scrim"))$("scrim").value=s.scrim;$("scrim-value").textContent=s.scrim+"%";$("shade").style.opacity=s.scrim/100;$("wallpaper").style.objectFit=s.fit==="contain"?"contain":"cover";document.querySelectorAll("[data-fit]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.fit===s.fit)));$("fit-note").textContent=s.fit==="adaptive"?"随窗口铺满，不留上下空带；原图不拉伸，边缘适度裁切。":s.fit==="contain"?"完整保留设定集，不拉伸。":"填满视区，边缘内容可能被裁切。";$("status").textContent=data.status.message;$("connection-title").textContent=data.status.applied?"皮肤已应用":data.status.connected?"宿主已连接":"等待宿主";$("dot").classList.toggle("active",data.status.connected);renderWallpapers(s);}
 function save(partial,message="已保存"){pending=pending.then(async()=>{try{data=await api.save(partial);$("saved").textContent=message;render();}catch(e){$("saved").textContent=e.message;}});return pending;}
 $("undo").onclick=()=>{clearTimeout(timer);clearTimeout(panTimer);panTimer=null;draft=null;save(original,"已恢复到打开面板时");};
 $("defaults").onclick=()=>{clearTimeout(timer);clearTimeout(panTimer);panTimer=null;draft=null;save(data.defaults,"已恢复默认，皮肤已关闭");};
 $("opacity").oninput=()=>{const opacity=Number($("opacity").value);$("opacity-value").textContent=opacity+"%";$("wallpaper").style.opacity=opacity/100;save({opacity});};
 document.querySelectorAll("[data-output-mode]").forEach(b=>b.onclick=()=>save({outputMode:b.dataset.outputMode}));
 $("enabled").onchange=()=>save({enabled:$("enabled").checked});
 document.querySelectorAll("[data-fit]").forEach(b=>b.onclick=()=>save({fit:b.dataset.fit}));
 $("scrim").oninput=()=>{const scrim=Number($("scrim").value);$("scrim-value").textContent=scrim+"%";$("shade").style.opacity=scrim/100;clearTimeout(timer);timer=setTimeout(()=>save({scrim}),200);};
 $("scrim").onchange=()=>{clearTimeout(timer);save({scrim:Number($("scrim").value)});};
 $("restore").onclick=()=>{clearTimeout(timer);save({enabled:false});};
 $("refresh").onclick=async()=>{data=await api.refresh();render();};
 document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{$("stage").dataset.mode=b.dataset.mode;document.querySelectorAll("[data-mode]").forEach(e=>e.setAttribute("aria-pressed",String(e===b)));});
 $("wallpaperId").onchange=()=>save({wallpaperId:$("wallpaperId").value});
 document.querySelectorAll("[data-rotate]").forEach(b=>b.onclick=()=>save(b.dataset.rotate==="off"?{slideshow:false}:{slideshow:true,slideshowIntervalMinutes:Number(b.dataset.rotate)}));
 function renderPosition(s={...data.settings,...draft}){
  const stage=$("stage"),img=$("wallpaper");if(!img.naturalWidth)return;
  const factor=(s.fit==="contain"?Math.min(stage.clientWidth/img.naturalWidth,stage.clientHeight/img.naturalHeight):Math.max(stage.clientWidth/img.naturalWidth,stage.clientHeight/img.naturalHeight))*s.zoom;
  const w=img.naturalWidth*factor,h=img.naturalHeight*factor;
  Object.assign(img.style,{width:w+"px",height:h+"px",left:(stage.clientWidth-w)*s.positionX/100+"px",top:(stage.clientHeight-h)*s.positionY/100+"px"});
 }
 for(const key of ["positionX","positionY","zoom"])$(key).oninput=()=>save({[key]:Number($(key).value)/(key==="zoom"?100:1)});
 $("center").onclick=()=>{clearTimeout(panTimer);panTimer=null;draft=null;save({positionX:50,positionY:50,zoom:1});};
 const stage=$("stage");stage.addEventListener("pointerdown",e=>{if(e.button!==0)return;e.preventDefault();clearTimeout(panTimer);panTimer=null;draft={positionX:data.settings.positionX,positionY:data.settings.positionY};const img=$("wallpaper");drag={id:e.pointerId,x:e.clientX,y:e.clientY,...draft,extraX:img.offsetWidth-stage.clientWidth,extraY:img.offsetHeight-stage.clientHeight};stage.setPointerCapture(e.pointerId);stage.dataset.dragging="true";});
 stage.addEventListener("pointermove",e=>{if(!drag)return;draft={positionX:Math.max(0,Math.min(100,drag.positionX-(Math.abs(drag.extraX)>1?(e.clientX-drag.x)/drag.extraX*100:0))),positionY:Math.max(0,Math.min(100,drag.positionY-(Math.abs(drag.extraY)>1?(e.clientY-drag.y)/drag.extraY*100:0)))};render();if(!panTimer)panTimer=setTimeout(()=>{panTimer=null;if(draft)save({...draft});},48);});
 function finishPan(){if(!drag)return;drag=null;stage.dataset.dragging="false";clearTimeout(panTimer);panTimer=null;const final={...draft};save(final).then(()=>{draft=null;render();});}
 stage.addEventListener("pointerup",finishPan);stage.addEventListener("pointercancel",finishPan);stage.addEventListener("lostpointercapture",finishPan);
 $("wallpaper").addEventListener("load",()=>renderPosition());new ResizeObserver(()=>renderPosition()).observe(stage);
 api.subscribe(next=>{data=next;renderAsset();render();});renderAsset();render();
})();
