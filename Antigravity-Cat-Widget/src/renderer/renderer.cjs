(async()=>{
 const api=window.widgetApi,$=id=>document.getElementById(id),mascot=$("mascot");
 let snapshot,selected="quota",closed=true,temporary=null,timeout,pointer=null,gesture=0,currentSound=null,petAt=0,hoverCount=0,hoverTime=0,hit=null;
 let personality,talkState,talkLine,eggTimer,autoHide,hideAnimation,lastBubbleOpen=null;
 let consecutiveClicks=0;
 function armBubble(){clearTimeout(autoHide);if(!closed)autoHide=setTimeout(()=>{closed=true;consecutiveClicks=0;render();},6500);}
 function bubbleVisibility(open){const bubble=$("bubble");if(lastBubbleOpen===open)return;lastBubbleOpen=open;clearTimeout(hideAnimation);bubble.inert=!open;bubble.setAttribute("aria-hidden",String(!open));if(open){bubble.hidden=false;void bubble.offsetWidth;requestAnimationFrame(()=>{if(lastBubbleOpen)bubble.dataset.open="true";});}else{bubble.dataset.open="false";hideAnimation=setTimeout(()=>{if(!lastBubbleOpen)bubble.hidden=true;},snapshot?.settings.reducedMotion?0:180);}}
 function stopReaction(){clearTimeout(eggTimer);if(mascot.dataset.expression){delete mascot.dataset.expression;talkState=null;}}
 const pages=["quota","claudeGpt","talk","today","latest"],format=v=>typeof v==="number"?v.toLocaleString():"—";
 function stopSound(){gesture++;if(currentSound){currentSound.pause();currentSound.currentTime=0;currentSound=null;}}
 async function play(kind){
  const token=++gesture;if(currentSound)currentSound.pause();if(!snapshot?.settings.sound||snapshot.settings.volume===0)return;
  const payload=await api.audio(kind);if(token!==gesture||!payload||!snapshot.settings.sound)return;
  currentSound=new Audio(payload.url);currentSound.volume=payload.effectiveVolume;currentSound.play().catch(()=>{});
 }
 function render(){
  if(!snapshot)return;const s=snapshot.settings,l=snapshot.ledger;
  const pack=s.characterPack==="lin-cat"?"lin-cat":"gemini-star-v1";
  // 帧图 URL 全部携带内容指纹版本号：资产更新即缓存失效，根治"偶尔变回老立绘"。
  const artKey=pack+":"+(snapshot.artVersion||"0");
  if(mascot.dataset.characterPack!==pack||mascot.dataset.artKey!==artKey){
   mascot.dataset.characterPack=pack;mascot.dataset.artKey=artKey;
   const v="?v="+artKey.replace(/[^a-z0-9]/gi,"-");
   const base=pack==="lin-cat"?"../../assets/character-packs/lin-cat/frames/":"../../assets/character-packs/gemini-star-v1/frames/";
   const files=pack==="lin-cat"?{idle:"idle.png",proud:"proud.png",sad:"sad.png",shy:"shy.png",angry:"angry.png"}:{idle:"idle.png",proud:"proud-v3.png",sad:"sad-v3.png",shy:"shy.png",angry:"angry.png"};
   const idleEl=document.querySelector(".agy-frame--idle");
   const proudEl=document.querySelector(".agy-expression--proud");
   const sadEl=document.querySelector(".agy-expression--crying");
   const shyEl=document.querySelector(".agy-expression--shy");
   const angryEl=document.querySelector(".agy-expression--angry");
   if(idleEl)idleEl.src=base+files.idle+v;
   if(proudEl)proudEl.src=base+files.proud+v;
   if(sadEl)sadEl.src=base+files.sad+v;
   if(shyEl)shyEl.src=base+files.shy+v;
   if(angryEl)angryEl.src=base+files.angry+v;
  }
  mascot.style.setProperty("--agy-width",(snapshot.displayScale||s.scale)+"px");mascot.style.setProperty("--agy-shift",(snapshot.artShift||0)+"px");mascot.dataset.state=snapshot.state;mascot.dataset.dock=snapshot.dockSide||"";mascot.dataset.facing=snapshot.facing||"left";mascot.dataset.reducedMotion=String(s.reducedMotion);
  bubbleVisibility(!closed&&s.bubbleOn);for(const id of ["quota","value","detail"])$(id).hidden=true;  $("page").textContent=(pages.indexOf(selected)+1)+" / "+pages.length;
  if(temporary){$("title").textContent=temporary.title;$("value").hidden=false;$("value").textContent=temporary.body;$("detail").hidden=!temporary.detail;$("detail").textContent=temporary.detail||"";$("meta").textContent=temporary.meta||"";return;}
  if(selected==="quota"||selected==="claudeGpt"){
   $("quota").hidden=false;
   const isClaude=selected==="claudeGpt";
   $("title").textContent=isClaude?"Claude & GPT":"Gemini Models";
   const q=snapshot.quotaWindows;
   const tag=$("model-tag");
   if(tag){
    if(!isClaude&&q?.modelInfo){
     tag.hidden=false;
     tag.innerHTML='<span>'+q.modelInfo.modelName+'</span><span class="thinking-badge">思考: '+q.modelInfo.thinking+'</span>';
    }else{
     tag.hidden=true;
    }
   }
   const gData=isClaude?q?.claudeGpt:(q?.gemini||q);
   const fiveVal=s.manualQuota?s.manualPercent:gData?.fiveHour;
   const weekVal=s.manualQuota?s.manualWeeklyPercent:gData?.weekly;
   const fiveReset=s.manualQuota?"":gData?.fiveHourReset||"";
   const weekReset=s.manualQuota?"":gData?.weeklyReset||"";

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
   $("caption").textContent=s.manualQuota?"手动记录":q?.stale?"上次读取 · 待更新":q?.cached?"上次读取":"";
   $("meta").textContent=isClaude?"第三方模型额度通道 · 点此刷新":"官方模型额度通道 · 点此刷新";
  }else if(selected==="today"){
   $("title").textContent="今日用量 · 本机";$("value").hidden=false;$("value").textContent=format(l.todayTokens.total);$("detail").hidden=false;
   $("detail").textContent="输入 "+format(l.todayTokens.prompt)+" · 缓存 "+format(l.todayTokens.cache)+" · 输出 "+format(l.todayTokens.output);
   $("meta").textContent=l.todaySteps+" 个模型步骤 · "+(l.partial?"部分字段缺失":snapshot.source.coverage||"只读日志");
  }else if(selected==="latest"){
   const r=l.latest;$("title").textContent="最近模型步骤";$("value").hidden=false;$("value").textContent=format(r?.tokens.total);$("detail").hidden=false;$("detail").textContent=r?"输入 "+format(r.tokens.input)+" · 输出 "+format(r.tokens.output):"尚无数值记录";
   $("meta").textContent=r?"本机记录 · 费用 —（无价格来源）":"等待真实会话记录";
  }else{$("title").textContent="喵言喵语";$("value").hidden=false;$("value").classList.add("agy-phrase");if(talkState!==(snapshot.persistentState||snapshot.state)){talkState=snapshot.persistentState||snapshot.state;talkLine=personality.say(talkState==="offline"?"idle":talkState);}$("value").textContent=talkLine;$("meta").textContent="点点本喵，再聊一句";}
  if(selected!=="talk")$("value").classList.remove("agy-phrase");
 }
 function message(title,body,detail="",ms=4500,meta=""){clearTimeout(timeout);temporary={title,body,detail,meta};closed=false;render();if(ms>0)timeout=setTimeout(()=>{temporary=null;render();},ms);}
 function select(delta){armBubble();clearTimeout(timeout);temporary=null;closed=false;selected=pages[(pages.indexOf(selected)+delta+pages.length)%pages.length];api.save({bubblePage:selected});render();}
 $("prev").onclick=()=>select(-1);$("next").onclick=()=>select(1);$("close").onclick=()=>{clearTimeout(autoHide);closed=true;consecutiveClicks=0;render();};$("toggle").onclick=()=>{closed=!closed;if(!snapshot.settings.bubbleOn)api.save({bubbleOn:true});armBubble();render();};$("settings").onclick=()=>api.command("settings");$("quota").onclick=()=>api.command("quota-refresh");
 window.addEventListener("contextmenu",e=>{e.preventDefault();api.command("menu");});
 $("bubble").addEventListener("pointerenter",()=>clearTimeout(autoHide));$("bubble").addEventListener("pointerleave",armBubble);
 const motion=$("motion");
 let spring;
 function animatePress(pressed){motion.dataset.pressed=String(pressed);}
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

  // 默认或「切换喵言喵语」：
  // 第1次摸头：看 Gemini Models 额度
  // 第2次摸头：看 Claude & GPT Models 额度
  // 第3次及以后：喵言喵语聊天 + 差分表情
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

  if (consecutiveClicks === 2) {
    selected = "claudeGpt";
    api.save({ bubblePage: "claudeGpt", bubbleOn: true });
    render();
  } else {
    selected = "talk";
    talkState = snapshot.persistentState || snapshot.state;
    talkLine = personality.say(talkState === "offline" ? "idle" : talkState);
    api.save({ bubblePage: "talk", bubbleOn: true });
    render();
    reaction(false, true);
  }
}
 function showQuota(){clearTimeout(timeout);temporary=null;closed=false;armBubble();selected="quota";api.save({bubblePage:"quota",bubbleOn:true});render();}
 motion.addEventListener("pointerdown",e=>{if(e.button!==0)return;pointer={id:e.pointerId,x:e.screenX,y:e.screenY,moved:false};motion.setPointerCapture(e.pointerId);animatePress(true);api.pointer({action:"down",point:{x:e.screenX,y:e.screenY}});play("press");});
 motion.addEventListener("pointermove",e=>{
  if(pointer){if(Math.hypot(e.screenX-pointer.x,e.screenY-pointer.y)>8)pointer.moved=true;api.pointer({action:"move",point:{x:e.screenX,y:e.screenY}});return;}
  const now=Date.now();hoverCount=now-hoverTime<250?hoverCount+1:1;hoverTime=now;if(hoverCount>16&&now-petAt>12000){hoverCount=0;petAt=now;api.pointer("pet");}
 });
 async function release(cancel=false){if(!pointer)return;pointer=null;const result=await api.pointer(cancel?"cancel":"up");animatePress(false);play("release");if(!result?.moved&&!cancel){activate();reaction(false,true);}}
 motion.addEventListener("pointerup",()=>release());motion.addEventListener("pointercancel",()=>release(true));motion.addEventListener("lostpointercapture",()=>release(true));window.addEventListener("blur",()=>release(true));
 motion.addEventListener("keydown",e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();activate();reaction(false,true);}});
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
  api.subscribe(data=>{if(snapshot&&(!data.settings.sound||data.settings.soundSet!==snapshot.settings.soundSet||data.settings.volume!==snapshot.settings.volume))stopSound();snapshot=data;if(!data.settings.easterEggs||!["idle","offline","pressed","release"].includes(data.state))stopReaction();render();});
 api.onStep(step=>{if(!closed&&snapshot?.settings.turnCostOn){message("模型步骤完成",format(step.tokens.total)+" tokens","输入 "+format(step.tokens.input)+" · 输出 "+format(step.tokens.output),snapshot.settings.turnCostDurationMs,"真实本机记录 · 非整轮计费");play("release");}});
 function reaction(manual=false,clicked=false){if(!snapshot||!personality)return;const isStr=typeof manual==="string";const kind=personality.reaction({enabled:snapshot.settings.easterEggs,hidden:document.hidden||(isStr?false:(closed||!snapshot.settings.bubbleOn)),busy:!isStr&&(!!temporary||!!pointer||(clicked&&!!mascot.dataset.expression)),state:clicked?snapshot.persistentState:snapshot.state},manual,clicked);if(!kind)return;mascot.dataset.expression=kind;if(isStr||selected==="talk"){selected="talk";closed=false;armBubble();talkLine=personality.say(kind);render();}clearTimeout(eggTimer);eggTimer=setTimeout(()=>{delete mascot.dataset.expression;talkState=null;render();},3200);}
 api.onReaction(payload=>reaction(typeof payload==="string"?payload:true));const ambient=setInterval(()=>reaction(),30000);
 snapshot=await api.get();personality=new window.StarPersonality(snapshot.dialogue);selected=snapshot.settings.bubblePage;render();
 window.addEventListener("beforeunload",()=>{clearTimeout(timeout);clearTimeout(autoHide);clearTimeout(hideAnimation);clearTimeout(eggTimer);clearInterval(ambient);stopSound();});
})();
