(async()=>{
 const api=window.widgetApi,$=id=>document.getElementById(id),mascot=$("mascot"),motion=$("motion"),sleepShell=motion.parentElement;
 let snapshot,selected="quota",closed=true,temporary=null,timeout,pointer=null,gesture=0,currentSound=null,hit=null;
 let tapTimer=null,artRenderSequence=0,artReadyNotified=false;
 let personality,talkState,talkLine,autoHide,hideAnimation,lastBubbleOpen=null,lastBubbleView;
 let consecutiveClicks=0;
 function armBubble(){clearTimeout(autoHide);const focus=document.activeElement;if(!closed&&!($("bubble").contains(focus)&&focus.matches(":focus-visible")))autoHide=setTimeout(()=>{closed=true;consecutiveClicks=0;render();},6500);}
 function applyHonorific(line){if(!line||!snapshot?.settings)return line;const mode=snapshot.settings.userHonorificMode||"none";if(mode==="none")return line;const name=mode==="zayu"?"杂鱼君":(mode==="custom"&&snapshot.settings.customHonorific?snapshot.settings.customHonorific.trim():"");if(!name)return line;return line.includes("人类")?line.replaceAll("人类",name):line;}
 function bubbleVisibility(open){const bubble=$("bubble");if(lastBubbleOpen===open)return;lastBubbleOpen=open;clearTimeout(hideAnimation);bubble.inert=!open;bubble.setAttribute("aria-hidden",String(!open));if(open){bubble.hidden=false;void bubble.offsetWidth;requestAnimationFrame(()=>{if(lastBubbleOpen)bubble.dataset.open="true";});}else{bubble.dataset.open="false";hideAnimation=setTimeout(()=>{if(!lastBubbleOpen)bubble.hidden=true;},snapshot?.settings.reducedMotion?0:180);}}
 const PetBehavior=window.CatstellaPetBehavior;
 sleepShell.style.setProperty("--agy-wake-duration",PetBehavior.wakeTime+"ms");
 const pet=new PetBehavior(({expression,rest,blink})=>{
  if(rest==="waking"&&mascot.dataset.rest!==rest){
   const offset=new DOMMatrixReadOnly(getComputedStyle(sleepShell).transform).m42;
   sleepShell.style.setProperty("--agy-nuzzle-start",offset+"px");
  }
  if(expression)mascot.dataset.expression=expression;
  else delete mascot.dataset.expression;
  mascot.dataset.rest=rest;
  mascot.dataset.blink=String(blink);
 });
 function syncPet(){
  if(!snapshot)return;
  const visible=!document.hidden&&snapshot.visibility?.visible!==false;
  const resting=visible&&["idle","offline","warning","error"].includes(snapshot.state);
  pet.sync({visible,idle:resting&&!pointer,rest:resting&&(!pointer||pet.rest==="sleeping")&&(closed||!snapshot.settings.bubbleOn),
   expressions:snapshot.settings.easterEggs});
 }
 function chooseTalk(express=false){
  talkState=snapshot.persistentState||snapshot.state;
  talkLine=personality.say(talkState==="offline"?"idle":talkState);
  if(express)pet.show(personality.expressionFor(talkLine),"dialogue");
 }
 const hasWebData=()=>Boolean(snapshot?.webCompanion?.online||snapshot?.webCompanion?.quota);
 const getPages=()=>{
  const list=["quota"];
  if(hasWebData())list.push("webQuota");
/* @byok-dev-start */
  if(snapshot?.byok?.available)list.push("claudeGpt");
/* @byok-dev-end */
  list.push("talk","today","latest");
  return list;
 };
 const format=v=>typeof v==="number"?v.toLocaleString():"—";
 function stopSound(){gesture++;if(currentSound){currentSound.pause();currentSound.currentTime=0;currentSound=null;}}
 async function play(kind){
  const token=++gesture;if(currentSound)currentSound.pause();if(!snapshot?.settings.sound||snapshot.settings.volume===0)return;
  const payload=await api.audio(kind);if(token!==gesture||!payload||!snapshot.settings.sound)return;
  currentSound=new Audio(payload.url);currentSound.volume=payload.effectiveVolume;currentSound.play().catch(()=>{});
 }
 async function paintArtwork(pack,frames,artKey){
  if(mascot.dataset.characterPack===pack&&mascot.dataset.artKey===artKey)return;
  const sequence=++artRenderSequence;
  mascot.dataset.artReady="false";
  mascot.dataset.characterPack=pack;mascot.dataset.artKey=artKey;
  const v="?v="+artKey.replace(/[^a-z0-9]/gi,"-");
  const base=pack==="lin-cat"?"../../assets/character-packs/lin-cat/frames/":"../../assets/character-packs/gemini-star-v1/frames/";
  const files={idle:"idle.png",blink:"blink.png",proud:pack==="lin-cat"?"proud.png":"proud-v3.png",sad:"sad.png",shy:"shy.png"};
  const idleEl=document.querySelector(".agy-frame--idle");
  const blinkEl=document.querySelector(".agy-frame--blink");
  const proudEl=document.querySelector(".agy-expression--proud");
  const shyEl=document.querySelector(".agy-expression--shy");
  const angryEl=document.querySelector(".agy-expression--angry");
  const source=frame=>(frames?.[frame]||frames?.idle||base+files[frame])+v;
  if(idleEl)idleEl.src=source("idle");
  if(blinkEl)blinkEl.src=source("blink");
  if(proudEl)proudEl.src=source("proud");
  if(shyEl)shyEl.src=source("shy");
  if(angryEl)angryEl.src=source("sad");
  const images=[idleEl,blinkEl,proudEl,shyEl,angryEl].filter(Boolean);
  await Promise.all(images.map(image=>image.decode?image.decode().catch(()=>{}):Promise.resolve()));
  if(sequence!==artRenderSequence)return;
  mascot.dataset.artReady="true";
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(!artReadyNotified&&typeof api.ready==="function"){
   artReadyNotified=true;
   api.ready();
  }
 }
 function render(){
  if(!snapshot)return;const s=snapshot.settings,l=snapshot.ledger,pages=getPages();
  if(!pages.includes(selected))selected="quota";
  syncPet();
  const bubbleView=temporary||selected;
  if(bubbleView!==lastBubbleView){lastBubbleView=bubbleView;$("bubble-body").scrollTop=0;}
  const frames=snapshot.characterPacks?.find(item=>item.id===s.characterPack)?.frames;
  const pack=frames?.idle?s.characterPack:s.characterPack==="lin-cat"?"lin-cat":"gemini-star-v1";
  // 帧图 URL 全部携带内容指纹版本号：资产更新即缓存失效，根治"偶尔变回老立绘"。
  const artKey=pack+":"+(snapshot.artVersion||"0");
  void paintArtwork(pack,frames,artKey);
  mascot.style.setProperty("--agy-width",(snapshot.displayScale||s.scale)+"px");mascot.style.setProperty("--agy-shift",(snapshot.artShift||0)+"px");mascot.dataset.state=snapshot.state;mascot.dataset.dock=snapshot.dockSide||"";mascot.dataset.facing=snapshot.facing||"left";mascot.dataset.reducedMotion=String(s.reducedMotion);
  bubbleVisibility(!closed&&s.bubbleOn);for(const id of ["quota","web-quota-panel","byok-panel","value","detail"])if($(id))$(id).hidden=true;$("page").textContent=(pages.indexOf(selected)+1)+" / "+pages.length;
  if(temporary){$("title").textContent=temporary.title;$("value").hidden=false;$("value").textContent=temporary.body;$("detail").hidden=!temporary.detail;$("detail").textContent=temporary.detail||"";$("meta").textContent=temporary.meta||"";return;}
  if(selected==="quota"){
   $("quota").hidden=false;
   $("title").textContent="Gemini Models";
   const q=snapshot.quotaWindows;
   const tag=$("model-tag");
   if(tag){
    if(q?.modelInfo){
     tag.hidden=false;
     tag.innerHTML='<span>'+q.modelInfo.modelName+'</span><span class="thinking-badge">思考: '+q.modelInfo.thinking+'</span>';
    }else{
     tag.hidden=true;
    }
   }
   const gData=q?.gemini||q;
   const isArgon=Boolean(q?.modelInfo?.modelName?.toLowerCase().includes("argon"));
   const hasArgonQuota=typeof q?.argon?.weekly==="number";
   const fiveVal=s.manualQuota?s.manualPercent:gData?.fiveHour;
   const weekVal=s.manualQuota?s.manualWeeklyPercent:(isArgon&&hasArgonQuota?q.argon.weekly:gData?.weekly);
   const fiveReset=s.manualQuota?"":gData?.fiveHourReset||"";
   const weekReset=s.manualQuota?"":(isArgon&&hasArgonQuota?(q.argon.weeklyReset||""):gData?.weeklyReset||"");
   if($("label-5h"))$("label-5h").textContent=isArgon?"5 小时 (共享)":"5 小时";
   if($("label-week"))$("label-week").textContent=isArgon?"1 周 (Argon WTU)":"1 周";

   for(const [suffix,value,resetStr] of [["",fiveVal,fiveReset],["-week",weekVal,weekReset]]){
    const known=typeof value==="number";
    $("percent"+suffix).textContent=known?Math.round(value)+"%":"—";
    $("fill"+suffix).style.width=known?value+"%":"100%";
    $("track"+suffix).dataset.known=String(known);
    $("track"+suffix).dataset.level=!known?"unknown":value<=10?"critical":value<=30?"low":"normal";
    $("percent"+suffix).dataset.level=$("track"+suffix).dataset.level;
    if(known)$("track"+suffix).setAttribute("aria-valuenow",value);else $("track"+suffix).removeAttribute("aria-valuenow");
    const rEl=$(suffix===""?"reset-5h":"reset-week");
    if(rEl)rEl.textContent=resetStr;
   }
   const wc=snapshot.webCompanion;
   const webBrief=wc?.quota?(typeof wc.quota.fiveHourUsedPct==="number"?(" · Web 5h 已用 "+wc.quota.fiveHourUsedPct+"%"):(wc.quota.dailyTotal?(" · Web 今日 "+wc.quota.dailyTotal+" 次"):"")):"";
   let extraHint="";if(isArgon&&typeof gData?.weekly==="number"){extraHint=" · 通用周额度余 "+Math.round(gData.weekly)+"%";}else if(!isArgon&&hasArgonQuota){extraHint=" · 🪐 Argon 余 "+Math.round(q.argon.weekly)+"%";}$("caption").textContent=(s.manualQuota?"手动记录":q?.stale?"上次读取 · 待更新":q?.cached?"上次读取":"")+extraHint+webBrief;
   $("meta").textContent="官方模型额度通道 · 点此刷新";
  }else if(selected==="webQuota"){
   const wc=snapshot.webCompanion||{},wq=wc.quota||{};
   $("web-quota-panel").hidden=false;
   $("title").textContent="Gemini Web · 伴侣";
   $("web-status-text").textContent=wc.online?(wc.active?"🟢 网页活跃同步中":"🟢 浏览器已联动"):"⚪ 缓存快照（离线）";
   $("web-model-badge").textContent=wq.displaySource==="official"?"官方账本":(wq.lastModel||"Web");
   if(typeof wq.fiveHourUsedPct==="number"){
    if($("web-5h-label"))$("web-5h-label").textContent="当前用量 (5h)";
    $("web-5h-count").textContent="已用 "+wq.fiveHourUsedPct+"% (余 "+Math.max(0,100-wq.fiveHourUsedPct)+"%)";
   }else{
    if($("web-5h-label"))$("web-5h-label").textContent="近 5h 调用";
    $("web-5h-count").textContent=(wq.window5hTotal??0)+" 次";
   }
   if(typeof wq.weeklyUsedPct==="number"){
    if($("web-daily-label"))$("web-daily-label").textContent="每周限额 (1w)";
    $("web-daily-count").textContent="已用 "+wq.weeklyUsedPct+"% (余 "+Math.max(0,100-wq.weeklyUsedPct)+"%)";
   }else if(wq.dailyTotal){
    if($("web-daily-label"))$("web-daily-label").textContent="今日累计对话";
    $("web-daily-count").textContent=(wq.dailyTotal??0)+" / "+(wq.dailyBudget||150)+" 次";
   }else{
    if($("web-daily-label"))$("web-daily-label").textContent="每周限额 (1w)";
    $("web-daily-count").textContent="待同步";
   }
   if(wq.sessionTurns||wq.sessionTokensEst){
    if($("web-split-label"))$("web-split-label").textContent="当前会话负载";
    $("web-model-split").textContent="第 "+(wq.sessionTurns||0)+" 轮 · ~"+((wq.sessionTokensEst||0)/1000).toFixed(1)+"k";
   }else{
    if($("web-split-label"))$("web-split-label").textContent="当前会话负载";
    $("web-model-split").textContent=wq.flashCount||wq.thinkingCount||wq.proCount?((wq.flashCount||0)+" / "+(wq.thinkingCount||0)+" / "+(wq.proCount||0)):"第 0 轮";
   }
   $("meta").textContent=wq.resetHint?("重置时间: "+wq.resetHint):(wc.online?"与浏览器扩展实时联动中":"打开 Gemini 网页即可自动同步");
/* @byok-dev-start */
  }else if(selected==="claudeGpt"){
   const b=snapshot.byok||{},ap=b.activeProvider,choices=Array.isArray(b.enabledModelChoices)?b.enabledModelChoices:[];
   const statusMap={online:"🟢 联通正常",warning:"🟡 待测速",error:"🔴 连接异常",disabled:"⚪ 未启用"};
   $("byok-panel").hidden=false;
   $("title").textContent=ap?.name?("BYOK · "+ap.name):"BYOK 模型网关";
   $("byok-status-text").textContent=ap?(statusMap[ap.status]||"🟡 待测速"):"⚪ 未配置供应商";
   $("byok-model-badge").textContent=ap?.activeModel||"未选模型";
   $("byok-model-badge").title="点击打开模型网关设置";
   const canCycle=choices.length>1;
   if($("byok-model-prev"))$("byok-model-prev").hidden=!canCycle;
   if($("byok-model-next"))$("byok-model-next").hidden=!canCycle;
   const balText=ap?.balance?.formatted||"";
   if($("byok-balance-row"))$("byok-balance-row").hidden=!balText;
   if($("byok-balance-badge")&&balText)$("byok-balance-badge").textContent=balText;
   $("byok-ping").textContent=typeof ap?.pingMs==="number"?("⚡ "+ap.pingMs+" ms"):(ap?.enabled?"点此测速":"未启用");
   $("byok-requests").textContent=(typeof b.todayRequests==="number"?b.todayRequests:0)+" 次";
   $("meta").textContent=(b.gatewayOnline?("网关 127.0.0.1:"+b.port):"网关离线")+" · 点卡片测速查余";
/* @byok-dev-end */
  }else if(selected==="today"){
   $("title").textContent="今日用量 · 本机";$("value").hidden=false;$("value").textContent=format(l.todayTokens.total);$("detail").hidden=false;
   $("detail").textContent="输入 "+format(l.todayTokens.prompt)+" · 缓存 "+format(l.todayTokens.cache)+" · 输出 "+format(l.todayTokens.output);
   $("meta").textContent=l.todaySteps+" 个模型步骤 · "+(l.partial?"部分字段缺失":snapshot.source.coverage||"只读日志");
  }else if(selected==="latest"){
   const r=l.latest;$("title").textContent="最近模型步骤";$("value").hidden=false;$("value").textContent=format(r?.tokens.total);$("detail").hidden=false;$("detail").textContent=r?"输入 "+format(r.tokens.input)+" · 输出 "+format(r.tokens.output):"尚无数值记录";
   $("meta").textContent=r?"本机记录 · 费用 —（无价格来源）":"等待真实会话记录";
  }else{$("title").textContent="喵言喵语";$("value").hidden=false;$("value").classList.add("agy-phrase");if(talkState!==(snapshot.persistentState||snapshot.state))chooseTalk();$("value").textContent=applyHonorific(talkLine);$("meta").textContent="点点本喵，再聊一句";}
  if(selected!=="talk")$("value").classList.remove("agy-phrase");
 }
 function message(title,body,detail="",ms=4500,meta=""){clearAmbient();clearTimeout(timeout);temporary={title,body,detail,meta};closed=false;render();if(ms>0)timeout=setTimeout(()=>{temporary=null;render();},ms);}
 function select(delta){const pages=getPages();armBubble();clearTimeout(timeout);temporary=null;closed=false;selected=pages[(pages.indexOf(selected)+delta+pages.length)%pages.length];if(selected==="talk")chooseTalk(true);api.save({bubblePage:selected});render();}
 $("prev").onclick=()=>select(-1);$("next").onclick=()=>select(1);$("close").onclick=()=>{clearTimeout(autoHide);closed=true;consecutiveClicks=0;render();};$("toggle").onclick=()=>{closed=!closed;if(!snapshot.settings.bubbleOn)api.save({bubbleOn:true});armBubble();render();};$("settings").onclick=()=>api.command("settings");$("quota").onclick=()=>api.command("quota-refresh");
/* @byok-dev-start */
 if($("byok-panel"))$("byok-panel").onclick=()=>api.command("byok-ping-active");
 if($("byok-model-prev"))$("byok-model-prev").onclick=e=>{e.stopPropagation();armBubble();api.command("byok-cycle-prev");};
 if($("byok-model-next"))$("byok-model-next").onclick=e=>{e.stopPropagation();armBubble();api.command("byok-cycle-next");};
 if($("byok-model-badge"))$("byok-model-badge").onclick=e=>{e.stopPropagation();api.command("byok-open-settings");};
/* @byok-dev-end */
 if($("web-quota-panel"))$("web-quota-panel").onclick=()=>select(1);
 window.addEventListener("contextmenu",e=>{e.preventDefault();api.command("menu");});
 $("bubble").addEventListener("pointerenter",()=>clearTimeout(autoHide));$("bubble").addEventListener("pointerleave",armBubble);
 $("bubble").addEventListener("focusin",event=>{if(event.target.matches(":focus-visible"))clearTimeout(autoHide);});
 $("bubble").addEventListener("focusout",event=>{if(!$("bubble").contains(event.relatedTarget))queueMicrotask(armBubble);});
 function hitsHead(event){
  const area=sleepShell.getBoundingClientRect();
  const x=event.clientX-area.left,y=event.clientY-area.top;
  return x>=area.width*.07&&x<=area.width*.93&&y>=area.height*.035&&y<=area.height*.80;
 }
 function animatePress(pressed){motion.dataset.pressed=String(pressed);}
 const pointerDistance=event=>Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y);
 function cancelPointerPress(){
  clearTimeout(tapTimer);
  tapTimer=null;
  if(!pointer?.pressActive)return;
  pointer.pressActive=false;
  animatePress(false);
  api.pointer("cancel");
 }
 function activate(){
  const action = snapshot?.settings?.clickCatAction || "talk";
  if (action === "cyclePages") {
    if (closed) {
      closed = false;
      armBubble();
      render();
    } else {
      select(1);
    }
    return;
  }

  if (closed) {
    consecutiveClicks = 1;
    closed = false;
    armBubble();
    selected = "quota";
    api.save({ bubblePage: "quota", bubbleOn: true });
    render();
    return;
  }

  consecutiveClicks++;
  armBubble();

  if (consecutiveClicks === 2 && hasWebData()) {
    selected = "webQuota";
    api.save({ bubblePage: "webQuota", bubbleOn: true });
    render();
/* @byok-dev-start */
  } else if ((consecutiveClicks === 2 || consecutiveClicks === 3) && snapshot?.byok?.available && selected !== "claudeGpt" && selected !== "talk") {
    selected = "claudeGpt";
    api.save({ bubblePage: "claudeGpt", bubbleOn: true });
    render();
/* @byok-dev-end */
  } else {
    selected = "talk";
    chooseTalk(true);
    api.save({ bubblePage: "talk", bubbleOn: true });
    render();
  }
 }
 motion.addEventListener("pointerdown",event=>{
  if(event.button!==0||!event.isPrimary||pointer)return;
  const head=hitsHead(event);
  const sleeping=pet.rest==="sleeping";
  pointer={id:event.pointerId,startedAt:performance.now(),sleeping,head,x:event.clientX,y:event.clientY,distance:0,pressActive:!sleeping};
  pet.activity();
  motion.setPointerCapture(event.pointerId);
  if(!sleeping){
   animatePress(true);
   api.pointer("down");
   clearTimeout(tapTimer);
   tapTimer=setTimeout(cancelPointerPress,PetBehavior.tapLimit);
  }
  syncPet();
  if(!sleeping)play("press");
 });
 motion.addEventListener("pointerenter",()=>pet.activity());
 motion.addEventListener("pointermove",event=>{
  if(pointer?.id!==event.pointerId)return;
  pointer.distance=Math.max(pointer.distance,pointerDistance(event));
  if(pointer.distance>PetBehavior.tapSlop)cancelPointerPress();
 });
 function release(cancel=false,event){
  if(!pointer||(event&&event.pointerId!==pointer.id))return;
  clearTimeout(tapTimer);tapTimer=null;
  const {sleeping,head,startedAt}=pointer;
  const distance=event?Math.max(pointer.distance,pointerDistance(event)):pointer.distance;
  const isTap=!cancel&&PetBehavior.isTap(performance.now()-startedAt,distance);
  pointer=null;
  animatePress(false);
  if(!sleeping)api.pointer(isTap?"up":"cancel");
  if(isTap)play("release");
  syncPet();
  if(isTap){
   if(pet.activity(true)||sleeping)return;
   activate();
   if(head&&pet.tap()==="proud")api.pointer("pet");
  }
 }
 motion.addEventListener("pointerup",event=>release(false,event));
 motion.addEventListener("pointercancel",event=>release(true,event));
 motion.addEventListener("lostpointercapture",event=>release(true,event));
 window.addEventListener("blur",()=>release(true));
 motion.addEventListener("keydown",event=>{
  if(event.key!==" "&&event.key!=="Enter")return;
  event.preventDefault();
  if(event.repeat)return;
  if(!pet.activity(true))activate();
 });
 window.addEventListener("mousemove",e=>{const active=!!e.target.closest(".interactive");if(hit!==active){hit=active;api.hit(active);}});
 window.addEventListener("mouseleave",()=>{hit=false;api.hit(false);});

  function reloadImages(){
    const ts=Date.now();
    for(const img of document.querySelectorAll(".agy-frame, .agy-expression")){
      if(img.src){
        try{
          const u=new URL(img.src, window.location.href);
          u.searchParams.set("t", ts);
          img.src=u.href;
        }catch{}
      }
    }
  }
  if(api.onRefresh)api.onRefresh(()=>{
    reloadImages();
    render();
  });
  api.subscribe(data=>{if(snapshot&&(!data.settings.sound||data.settings.soundSet!==snapshot.settings.soundSet||data.settings.volume!==snapshot.settings.volume))stopSound();snapshot=data;render();});
 api.onStep(step=>{if(!closed&&snapshot?.settings.turnCostOn){message("模型步骤完成",format(step.tokens.total)+" tokens","输入 "+format(step.tokens.input)+" · 输出 "+format(step.tokens.output),snapshot.settings.turnCostDurationMs,"真实本机记录 · 非整轮计费");play("release");}});
 api.onReaction(payload=>{
  if(payload?.source==="preview"){
   if(payload.expression==="nap")pet.previewNap();
   else pet.show(payload.expression,"preview");
  }
  else if(typeof payload==="string")pet.show(payload,"system");
 });
 let ambientTimer,ambientMessage,previousAmbient;
 function clearAmbient(){
  if(!ambientMessage)return;
  clearTimeout(ambientTimer);
  if(temporary===ambientMessage){temporary=null;closed=true;render();}
  ambientMessage=null;
 }
 const readyForAmbient=()=>snapshot?.settings.ambientChatter&&snapshot.settings.bubbleOn&&closed&&!pointer&&!temporary&&!document.hidden&&["idle","offline"].includes(snapshot.state);
 const chatter=new window.CatstellaChatter({
  allowed:async()=>readyForAmbient()&&await api.canChatter()&&readyForAmbient(),
  speak:()=>{
   previousAmbient=window.CatstellaChatter.pickLine(previousAmbient);
   message("喵言喵语",applyHonorific(previousAmbient),"",0);
   ambientMessage=temporary;
   ambientTimer=setTimeout(clearAmbient,4500);
  }
 });
 const quiet=()=>{clearAmbient();chatter.reset();};
 document.addEventListener("pointerdown",quiet,true);
 document.addEventListener("keydown",quiet,true);
 document.addEventListener("visibilitychange",()=>{quiet();syncPet();});
 api.subscribe(data=>{
  chatter.configure(data.settings.ambientChatter===true);
  if(!data.settings.ambientChatter||!data.settings.bubbleOn||!["idle","offline"].includes(data.state)||data.webCompanion?.active)clearAmbient();
 });
 snapshot=await api.get();personality=new window.StarPersonality(snapshot.dialogue,Math.random,snapshot.dialogueTags);selected=snapshot.settings.bubblePage;render();
 chatter.configure(snapshot.settings.ambientChatter===true);
 window.addEventListener("beforeunload",()=>{clearTimeout(timeout);clearTimeout(autoHide);clearTimeout(hideAnimation);pet.dispose();stopSound();});
})();
