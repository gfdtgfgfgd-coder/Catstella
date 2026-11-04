// Serialized into the host by its existing local CDP endpoint. No app files are modified.
async function installTheme(config){
 const key="__agyDreamSkinV2";
 if(window[key]){if(window[key].owner!==config.owner)throw new Error("皮肤由另一个运行实例管理");if(window[key].status().applied){window[key].update(config);return window[key].status();}window[key].destroy();}
 document.querySelectorAll('#agy-dream-style-v2, #agy-dream-wallpaper-v2').forEach(el => el.remove());
 const root=document.querySelector("#root")||document.querySelector("#app");
 if(!root)return{applied:false,reason:"unsupported-root"};
 const image=new Image();image.src=config.image;await image.decode();
 if(!root.isConnected)return{applied:false,reason:"detached-root"};
 document.querySelectorAll('#agy-dream-wallpaper-v2').forEach(el => el.remove());
 const saved=[],seen=new WeakSet();
 const protect=".monaco-editor,.cm-editor,.xterm,.integrated-terminal,textarea,pre,code,[contenteditable=true],[role=dialog],[role=menu],[role=listbox]";
 const layer=document.createElement("div");layer.id="agy-dream-wallpaper-v2";layer.setAttribute("aria-hidden","true");
 Object.assign(layer.style,{position:"fixed",inset:"0",zIndex:"0",pointerEvents:"none",backgroundRepeat:"no-repeat",backgroundPosition:"center",backgroundColor:"#f8f6ff",transition:"background-image 0.8s ease-in-out, opacity 0.4s ease"});
 const style=document.createElement("style");style.id="agy-dream-style-v2";style.textContent=`
 html.agy-dream-active-v2 body { background:var(--agy-dream-base-bg)!important; }
 html.agy-dream-active-v2 [data-agy-dream-root] { position:relative;z-index:1; }
 html.agy-dream-active-v2 [data-agy-dream-clear] { background-color:transparent!important;background-image:none!important; }
 html.agy-dream-active-v2 [data-agy-dream-protect] { background-color:var(--agy-dream-old-bg)!important;backdrop-filter:none!important; }
 html.agy-dream-active-v2 [data-agy-dream-card] { background-color:var(--agy-dream-card-bg)!important;backdrop-filter:blur(12px);border-radius:12px; }
 html.agy-dream-active-v2 [data-agy-dream-chrome] { background-color:var(--agy-dream-chrome-bg)!important;backdrop-filter:blur(12px); }
 html.agy-dream-active-v2 :is(.bg-sidebar,aside,[role=navigation]) {background-color:var(--agy-ui-surface)!important;background-image:none!important;border-color:#ae8eda38!important;}
 html.agy-dream-active-v2 :is(header,[role=tablist],[role=status],.titlebar) {background-color:var(--agy-ui-surface)!important;border-color:#ae8eda38!important;}
 html.agy-dream-active-v2 :is(.bg-sidebar,[role=navigation],aside) :is([aria-selected=true],[aria-current=true],[data-state=active],[class~="bg-sidebar-muted"],[class~="bg-sidebar-secondary"]) {background-color:var(--agy-ui-selected)!important;background-image:none!important;box-shadow:inset 3px 0 #bda2f2,inset 0 0 0 1px #bda2f238;border-radius:9px;}
 html.agy-dream-active-v2 :is(button,a,[role=tab]):hover:not(:disabled) {outline-color:#b99bea;background-color:var(--agy-ui-hover);}
 html.agy-dream-active-v2 :is([role=tab][aria-selected=true],[role=tab][data-state=active]) {background:var(--agy-ui-selected)!important;box-shadow:inset 0 -2px #b99bea;}
 html.agy-dream-active-v2 :is(button,a,input):focus-visible {outline:2px solid #b49aee;outline-offset:2px;}
 html.agy-dream-active-v2 :is([role=menu],[role=dialog],[role=listbox]) {background-color:var(--agy-ui-surface)!important;border-color:#ae8eda38!important;box-shadow:0 8px 28px #15101f38;}
 html.agy-dream-active-v2 .agy-sheet {border-radius:22px;overflow:hidden;box-shadow:inset 0 0 0 1px #c5afe626;}
 html.agy-dream-active-v2 [data-agy-dream-welcome] { padding-top:0!important;justify-content:flex-end!important;padding-bottom:28px!important; }
 html.agy-dream-active-v2 [data-agy-dream-fade] {background:none!important;box-shadow:none!important;}

 /* Reading & bleed surface transparency without wiping user bubbles, pills or tools */
 html.agy-dream-active-v2 [data-agy-dream-reading] {background:transparent!important;border:0;box-shadow:none;}
 html.agy-dream-active-v2 :is([data-agy-dream-reading],.md-sticky-message-bleed,.surface-composer-card) {background-color:transparent!important;background-image:none!important;}
 html.agy-dream-active-v2 :is([data-agy-dream-reading],.md-sticky-message-bleed) *:not(
   .monaco-editor,.monaco-editor *,.cm-editor,.cm-editor *,.xterm,.xterm *,.integrated-terminal,.integrated-terminal *,
   .agy-user-bubble,.agy-user-bubble *,[data-testid="user-message-bubble"],[data-testid="user-message-bubble"] *,.user-input-buttons-container,.user-input-buttons-container *,
   [data-testid="worked-for-collapsible"],[data-testid="worked-for-collapsible"] *,[data-testid="tool-group-collapsible"],[data-testid="tool-group-collapsible"] *,
   [data-markdown-root],[data-markdown-root] *,
   button,button *
 ) {background-color:transparent!important;background-image:none!important;backdrop-filter:none!important;}

 /* Sticky header gradient cleanup */
 html.agy-dream-active-v2 :is([data-agy-dream-reading],.md-sticky-message-bleed)::after,
 html.agy-dream-active-v2 :is([data-agy-dream-reading],.md-sticky-message-bleed)::before {display:none!important;background:none!important;box-shadow:none!important;}
 html.agy-dream-active-v2 .md-sticky-message-bleed {box-shadow:none!important;}
 html.agy-dream-active-v2 .agy-sheet :has(>.md-sticky-message-bleed){position:relative!important;top:auto!important;}

 /* User Message Bubble - Liquid Dream Glass (High Readability) */
 html.agy-dream-active-v2 .agy-user-bubble-frame {background:transparent!important;border:none!important;box-shadow:none!important;}
 html.agy-dream-active-v2 :is(.agy-user-bubble,[data-testid="user-message-bubble"],user-query,.user-query) {
   background-color:transparent!important;
   background-image:var(--agy-ui-user-bubble)!important;
   backdrop-filter:blur(28px) saturate(140%)!important;
   -webkit-backdrop-filter:blur(28px) saturate(140%)!important;
   border:1px solid var(--agy-ui-user-border)!important;
   border-radius:16px!important;
   box-shadow:0 6px 24px rgba(12,9,22,0.5),inset 0 1px 0 rgba(227,212,255,0.32)!important;
   padding:10px 16px!important;
   color:var(--agy-ui-user-color)!important;
 }
 html.agy-dream-active-v2 :is(.agy-user-bubble,[data-testid="user-message-bubble"],user-query,.user-query) [data-quotable="true"] {
   color:var(--agy-ui-user-color)!important;
   text-shadow:0 1px 2px rgba(0,0,0,0.55)!important;
   font-weight:450!important;
 }
 html.agy-dream-active-v2 :is(.agy-user-bubble,[data-testid="user-message-bubble"]) .user-input-buttons-container {
   background-color:var(--agy-ui-surface)!important;
   backdrop-filter:blur(14px)!important;
   -webkit-backdrop-filter:blur(14px)!important;
   border:1px solid var(--agy-ui-user-border)!important;
   border-radius:9999px!important;
   box-shadow:0 2px 10px rgba(0,0,0,0.35)!important;
 }

 /* Thinking & Tool Calls - Single Layer Frosted Crystal Pills */
 html.agy-dream-active-v2 :is([data-testid="worked-for-collapsible"],[data-testid="tool-group-collapsible"]) {
   background-color:var(--agy-ui-pill-bg)!important;
   border:1px solid var(--agy-ui-pill-border)!important;
   border-radius:12px!important;
   backdrop-filter:blur(14px)!important;
   -webkit-backdrop-filter:blur(14px)!important;
   box-shadow:inset 0 1px 0 rgba(227,212,255,0.15),0 2px 8px rgba(16,12,27,0.2)!important;
   transition:all 0.2s cubic-bezier(0.2,0,0,1)!important;
   margin-bottom:4px!important;
 }
 html.agy-dream-active-v2 :is([data-testid="worked-for-collapsible"],[data-testid="tool-group-collapsible"]):hover {
   background-color:var(--agy-ui-pill-hover)!important;
   border-color:rgba(189,162,242,0.45)!important;
   box-shadow:inset 0 1px 0 rgba(227,212,255,0.25),0 4px 12px rgba(16,12,27,0.3)!important;
 }

 /* Composer */
 html.agy-dream-active-v2 .agy-sheet .surface-composer[class] {
   border-radius:22px!important;
   background-color:transparent!important;
   background-image:var(--agy-ui-glass)!important;
   backdrop-filter:blur(24px) saturate(130%)!important;
   -webkit-backdrop-filter:blur(24px) saturate(130%)!important;
   border:1px solid var(--agy-ui-glass-border)!important;
   box-shadow:inset 0 1px 0 rgba(227,212,255,0.22),0 10px 30px rgba(16,12,27,0.35)!important;
   transition:border-color 0.25s ease,box-shadow 0.25s ease!important;
 }
 /* Outer card dream-like starlight glow on focus */
 html.agy-dream-active-v2 .agy-sheet .surface-composer:focus-within {
   border-color:rgba(189,162,242,0.85)!important;
   box-shadow:0 0 0 1px rgba(189,162,242,0.55),0 0 24px rgba(189,162,242,0.35),0 12px 36px rgba(16,12,27,0.5),inset 0 1px 0 rgba(227,212,255,0.4)!important;
 }
 html.agy-dream-active-v2 .agy-sheet .surface-composer-card {
   border-radius:21px!important;
   background:transparent!important;
 }
 /* Eliminate black block and internal focus outline inside composer */
 html.agy-dream-active-v2 .surface-composer :is([contenteditable="true"],textarea,[data-lexical-editor="true"],.w-full) {
   background-color:transparent!important;
   background-image:none!important;
   backdrop-filter:none!important;
   -webkit-backdrop-filter:none!important;
 }
 html.agy-dream-active-v2 .surface-composer :is([contenteditable="true"],textarea,[data-lexical-editor="true"],input):focus,
 html.agy-dream-active-v2 .surface-composer :is([contenteditable="true"],textarea,[data-lexical-editor="true"],input):focus-visible {
   outline:none!important;
   box-shadow:none!important;
   border-color:transparent!important;
 }
 html.agy-dream-active-v2 .surface-composer *:focus-visible {
   outline:none!important;
 }
 html.agy-dream-active-v2 .surface-composer :is([data-testid="model-selector-trigger"],[data-testid="permissions-selector-trigger"]) {
   background-color:var(--agy-ui-pill-bg)!important;
   border:1px solid var(--agy-ui-pill-border)!important;
   backdrop-filter:blur(10px)!important;
   transition:all 0.2s ease!important;
 }
 html.agy-dream-active-v2 .surface-composer :is([data-testid="model-selector-trigger"],[data-testid="permissions-selector-trigger"]):hover {
   background-color:var(--agy-ui-pill-hover)!important;
   border-color:rgba(189,162,242,0.4)!important;
 }

 /* Attachment Thumbnails Enlarged & Polished */
 html.agy-dream-active-v2 :is([data-testid="input-attachment"],.group\\/attachment) {
   background-color:var(--agy-ui-surface)!important;
   border:1px solid var(--agy-ui-glass-border)!important;
   border-radius:14px!important;
   backdrop-filter:blur(14px)!important;
   -webkit-backdrop-filter:blur(14px)!important;
   box-shadow:0 4px 16px rgba(10,8,20,0.35)!important;
   padding:3px!important;
   transition:transform 0.2s ease,border-color 0.2s ease!important;
   overflow:visible!important;
 }
 html.agy-dream-active-v2 :is([data-testid="input-attachment"],.group\\/attachment):hover {
   transform:scale(1.03);
   border-color:rgba(189,162,242,0.65)!important;
 }
 html.agy-dream-active-v2 :is([data-testid="input-attachment"],.group\\/attachment) img {
   width:76px!important;
   height:76px!important;
   min-width:76px!important;
   min-height:76px!important;
   border-radius:11px!important;
   object-fit:cover!important;
   display:block!important;
 }
 html.agy-dream-active-v2 :is([data-testid="input-attachment-remove"],.group\\/attachment button) {
   width:24px!important;
   height:24px!important;
   min-width:24px!important;
   min-height:24px!important;
   background-color:rgba(28,22,44,0.95)!important;
   border:1.5px solid rgba(189,162,242,0.65)!important;
   border-radius:9999px!important;
   top:-8px!important;
   right:-8px!important;
   opacity:1!important;
   display:flex!important;
   align-items:center!important;
   justify-content:center!important;
   box-shadow:0 2px 8px rgba(0,0,0,0.45)!important;
   cursor:pointer!important;
   z-index:20!important;
   transition:transform 0.15s ease,background-color 0.15s ease,border-color 0.15s ease!important;
 }
 html.agy-dream-active-v2 :is([data-testid="input-attachment-remove"],.group\\/attachment button):hover {
   transform:scale(1.15)!important;
   background-color:rgba(60,44,90,0.98)!important;
   border-color:rgba(215,190,255,0.9)!important;
 }
 html.agy-dream-active-v2 :is([data-testid="input-attachment-remove"],.group\\/attachment button) svg {
   width:14px!important;
   height:14px!important;
   stroke:#fdfcff!important;
   color:#fdfcff!important;
   stroke-width:2.5!important;
 }

 /* Overview Floating Panel */
 html.agy-dream-active-v2 .animate-overview-panel {
   background-color:transparent!important;
   background-image:var(--agy-ui-glass)!important;
   backdrop-filter:blur(24px) saturate(135%)!important;
   -webkit-backdrop-filter:blur(24px) saturate(135%)!important;
   border:1px solid var(--agy-ui-glass-border)!important;
   border-radius:16px!important;
   box-shadow:0 12px 36px rgba(12,9,22,0.45),inset 0 1px 0 rgba(227,212,255,0.22)!important;
 }
 html.agy-dream-active-v2 .animate-overview-panel :is(.bg-card,.bg-muted) {
   background-color:transparent!important;
 }
 html.agy-dream-active-v2 .animate-overview-panel [class*="border-border"] {
   border-color:var(--agy-ui-glass-border)!important;
 }
 html.agy-dream-active-v2 .animate-overview-panel [class*="hover:bg-"]:hover {
   background-color:var(--agy-ui-hover)!important;
 }

 /* Assistant Reading Surface */
 html.agy-dream-active-v2 [data-agy-output-mode="glass"] [data-markdown-root] {
   background-color:transparent!important;
   background-image:var(--agy-ui-glass)!important;
   backdrop-filter:blur(20px) saturate(125%)!important;
   -webkit-backdrop-filter:blur(20px) saturate(125%)!important;
   border-radius:16px!important;
   border:1px solid var(--agy-ui-glass-border)!important;
   box-shadow:0 4px 20px rgba(12,9,22,0.28),inset 0 1px 0 rgba(227,212,255,0.15)!important;
   padding:16px 20px!important;
 }
 html.agy-dream-active-v2 [data-agy-output-mode="glass"] [data-markdown-root] [data-agy-dream-segment] {
   background:none!important;
   backdrop-filter:none!important;
   -webkit-backdrop-filter:none!important;
   box-shadow:none!important;
   border:none!important;
   padding:0!important;
   margin-bottom:0!important;
 }
 html.agy-dream-active-v2 [data-agy-output-mode="glass"] :not([data-markdown-root]) > [data-agy-dream-segment] {
   background-color:transparent!important;
   background-image:var(--agy-ui-glass)!important;
   backdrop-filter:blur(18px) saturate(115%)!important;
   -webkit-backdrop-filter:blur(18px) saturate(115%)!important;
   border-radius:14px;
   box-shadow:inset 0 1px 0 #e3d4ff24,0 4px 16px #100c1b18;
   padding:12px 16px;
   margin-bottom:6px;
 }
 html.agy-dream-active-v2 [data-agy-output-mode="transparent"] [data-markdown-root],
 html.agy-dream-active-v2 [data-agy-output-mode="transparent"] [data-agy-dream-segment] {
   text-shadow:0 1px 2px rgba(0,0,0,0.6)!important;
 }

 /* Editors, Terminals, Code Blocks */
 html.agy-dream-active-v2 [data-agy-dream-protect] { background-color:var(--agy-dream-old-bg)!important;backdrop-filter:none!important;opacity:1!important; }
 html.agy-dream-active-v2 pre,
 html.agy-dream-active-v2 .monaco-editor,
 html.agy-dream-active-v2 .cm-editor,
 html.agy-dream-active-v2 .xterm {
   background-color:var(--agy-ui-code-bg)!important;
   backdrop-filter:blur(12px)!important;
   border:1px solid rgba(174,142,218,0.25)!important;
   border-radius:10px!important;
 }
 html.agy-dream-active-v2 :is([role=dialog],[role=menu],[role=listbox]) {border-radius:16px;}
 `;
 function mark(el,attribute){if(!el.hasAttribute(attribute)){saved.push([el,attribute,null]);el.setAttribute(attribute,"");}}
 function variable(el,key,value){saved.push([el,"style:"+key,el.style.getPropertyValue(key),el.style.getPropertyPriority(key)]);el.style.setProperty(key,value);}
 function restore([el,attr,value,priority]){if(attr.startsWith("style:")){const k=attr.slice(6);value?el.style.setProperty(k,value,priority):el.style.removeProperty(k);}else value===null?el.removeAttribute(attr):el.setAttribute(attr,value);}
 mark(root,"data-agy-output-mode");mark(root,"data-agy-dream-root");mark(root,"data-agy-dream-clear");
 const nativeBackgrounds=new WeakMap([[root,getComputedStyle(root).backgroundColor]]);
 function surfaceBackground(el){
  for(let node=el;node;node=node.parentElement){const bg=nativeBackgrounds.get(node)||getComputedStyle(node).backgroundColor;if(bg!=="transparent"&&bg!=="rgba(0, 0, 0, 0)")return bg;}
  return "#fff";
 }
 const bodyColor=surfaceBackground(root);
 const rgb=bodyColor.match(/[\d.]+/g)?.slice(0,3).map(Number)||[255,255,255],dark=rgb.reduce((a,b)=>a+b,0)<360;
 const fallback=bodyColor;
 variable(document.body,"--agy-ui-surface",dark?"#211e2d":"#f3edfc");
 variable(document.body,"--agy-ui-selected",dark?"#443754":"#e5d8f6");
 variable(document.body,"--agy-ui-reading",dark?"#211e2df5":"#fffafff5");
 variable(document.body,"--agy-ui-hover",dark?"#a58ade1c":"#b494e526");
 variable(document.body,"--agy-ui-glass",dark?"linear-gradient(165deg,rgba(36,28,54,0.92),rgba(18,14,28,0.96))":"linear-gradient(165deg,rgba(255,250,255,0.95),rgba(238,228,250,0.92))");
 variable(document.body,"--agy-ui-glass-border",dark?"rgba(189,162,242,0.32)":"rgba(174,142,218,0.38)");
 variable(document.body,"--agy-ui-user-bubble",dark?"linear-gradient(145deg,rgba(48,34,74,0.94),rgba(24,18,38,0.97))":"linear-gradient(145deg,rgba(255,255,255,0.97),rgba(240,232,252,0.94))");
 variable(document.body,"--agy-ui-user-border",dark?"rgba(189,162,242,0.45)":"rgba(174,142,218,0.48)");
 variable(document.body,"--agy-ui-user-color",dark?"#ffffff":"#1c1828");
 variable(document.body,"--agy-ui-pill-bg",dark?"rgba(165,138,222,0.14)":"rgba(255,255,255,0.65)");
 variable(document.body,"--agy-ui-pill-border",dark?"rgba(174,142,218,0.28)":"rgba(174,142,218,0.35)");
 variable(document.body,"--agy-ui-pill-hover",dark?"rgba(165,138,222,0.25)":"rgba(255,255,255,0.85)");
 variable(document.body,"--agy-ui-code-bg",dark?"rgba(20,16,30,0.92)":"rgba(250,246,255,0.92)");
 for(const [name,value] of Object.entries(dark?{"--background":"#1c1926","--card":"#262132","--popover":"#2b2537","--muted":"#30283e","--secondary":"#342b43","--sidebar":"#211e2d","--sidebar-muted":"#443754","--border":"#ac8ddd32","--ring":"#baa0ef"}:{"--background":"#faf7ff","--card":"#fffaff","--popover":"#fffaff","--muted":"#eee4f7","--secondary":"#eadff6","--sidebar":"#f3edfc","--sidebar-muted":"#e5d8f6","--border":"#a98bd63b","--ring":"#9d7bd1"}))variable(root,name,value);

 variable(document.body,"--agy-dream-base-bg",dark?"#211e2d":"#f3edfc");
 let active=true,timer,observer,resize,geometryTarget=null;
 function geometry(){
  const pane=[...document.querySelectorAll(".agy-sheet")].sort((a,b)=>b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height)[0];
  const welcome=pane&&[...pane.querySelectorAll("div")].find(e=>e.classList.contains("pt-[30vh]")||e.getAttribute("data-testid")==="welcome-view");
  if(welcome)mark(welcome,"data-agy-dream-welcome");
  const region=pane||root,r=region.getBoundingClientRect();
  Object.assign(layer.style,{inset:"auto",left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px",borderRadius:pane?"22px":"0"});
  if(resize&&geometryTarget!==region){if(geometryTarget&&geometryTarget!==root)resize.unobserve(geometryTarget);resize.observe(region);geometryTarget=region;}
  const factor=(config.fit==="contain"?Math.min(r.width/image.naturalWidth,r.height/image.naturalHeight):Math.max(r.width/image.naturalWidth,r.height/image.naturalHeight))*(config.zoom??1);
  layer.style.backgroundSize="100% 100%,"+Math.round(image.naturalWidth*factor)+"px "+Math.round(image.naturalHeight*factor)+"px";
  layer.style.backgroundPosition="center,"+(config.positionX??50)+"% "+(config.positionY??50)+"%";
  return{region,scope:pane||root,width:r.width,height:r.height};
 }
 function scan(){
  if(!active)return;
  // Release removed page nodes; restore them first so reattachment can be themed again.
  for(let i=saved.length-1;i>=0;i--)if(!saved[i][0].isConnected){restore(saved[i]);seen.delete(saved[i][0]);saved.splice(i,1);}
  const area=geometry();
  for(const fade of area.scope.querySelectorAll(".absolute.bottom-0.pointer-events-none")){
   const rect=fade.getBoundingClientRect();
   if(rect.height<=80&&rect.width>area.width*.3&&getComputedStyle(fade).backgroundImage.includes("linear-gradient"))mark(fade,"data-agy-dream-fade");
  }
  for(let parent=area.scope;parent&&root.contains(parent);parent=parent.parentElement){if(!nativeBackgrounds.has(parent))nativeBackgrounds.set(parent,getComputedStyle(parent).backgroundColor);mark(parent,"data-agy-dream-clear");if(parent===root)break;}
  for(const article of area.scope.querySelectorAll(".scroll-mt-4,[role=article],.prose,.markdown-body,[data-markdown-root]")){
   const plate=article.closest(".scroll-mt-4")||article;
   mark(plate,"data-agy-dream-reading");
   seen.add(plate);
   for(const segment of article.querySelectorAll("p,h1,h2,h3,h4,h5,h6,ul,ol,blockquote,table")){
    if(!segment.parentElement.closest("ul,ol,blockquote,table,pre,.monaco-editor,.cm-editor,.xterm,form,.agy-user-bubble,[data-testid='user-message-bubble']"))
     mark(segment,"data-agy-dream-segment");
   }
  }
  for(const composer of area.scope.querySelectorAll(".surface-composer,form")){
   let plate=composer,parent=composer.parentElement;
   while(parent&&parent!==root){
    const r=parent.getBoundingClientRect();
    if(r.width>area.width*.8||r.height>area.height*.3)break;
    if(r.width>0&&r.height>0)plate=parent;
    parent=parent.parentElement;
   }
   if(!seen.has(plate)){mark(plate,"data-agy-dream-card");variable(plate,"--agy-dream-card-bg",dark?"rgba(31,29,43,.95)":"rgba(255,255,255,.94)");seen.add(plate);}
  }
  for(const el of root.querySelectorAll("div,main,section,aside,nav,header,form,textarea,pre,code,[contenteditable=true],[role=dialog],[role=menu],[role=listbox]")){
   if(!area.scope.contains(el))continue;
   if(seen.has(el)||el===layer||el===style||el.closest("#agy-dream-wallpaper-v2"))continue;
   for(const p of area.scope.querySelectorAll(".surface-composer [data-agy-dream-protect],.surface-composer [data-agy-dream-card]")){p.removeAttribute("data-agy-dream-protect");p.removeAttribute("data-agy-dream-card");p.style.removeProperty("--agy-dream-old-bg");p.style.removeProperty("--agy-dream-card-bg");}
   if(el.closest(".agy-user-bubble,[data-testid='user-message-bubble'],.agy-user-bubble-frame,[data-testid='user-input-step'],.surface-composer,form"))continue;
   const rect=el.getBoundingClientRect();if(rect.width<1||rect.height<1)continue;
   const css=getComputedStyle(el),bg=css.backgroundColor;
   nativeBackgrounds.set(el,bg);
   if(el.matches(protect)){
    mark(el,"data-agy-dream-protect");variable(el,"--agy-dream-old-bg",surfaceBackground(el));seen.add(el);continue;
   }
   if(el.closest(protect))continue;
   if(bg!=="rgba(0, 0, 0, 0)"&&bg!=="transparent"&&(el.matches("aside,nav,header,[role=navigation]")||(rect.width<innerWidth*.35&&rect.height>innerHeight*.55)||(rect.top<90&&rect.width>innerWidth*.65&&rect.height<110))){
    mark(el,"data-agy-dream-chrome");variable(el,"--agy-dream-chrome-bg",dark?"rgba(25,20,38,.76)":"rgba(249,244,255,.80)");seen.add(el);continue;
   }
   if(el.matches(".surface-composer,.surface-composer-card,form")){
    mark(el,"data-agy-dream-card");variable(el,"--agy-dream-card-bg",dark?"rgba(31,29,43,.96)":"rgba(255,255,255,.95)");seen.add(el);continue;
   }
   if(el.matches("div,main,section")&&rect.width>innerWidth*.42&&rect.height>innerHeight*.36){
    mark(el,"data-agy-dream-clear");seen.add(el);
   }
  }
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(scan,160);}
 function update(next){config=next;root.setAttribute("data-agy-output-mode",config.outputMode==="glass"?"glass":"transparent");document.querySelectorAll("#agy-dream-wallpaper-v2").forEach(el=>{if(el!==layer)el.remove();});layer.style.opacity=String(config.opacity??.55);layer.style.backgroundColor="transparent";layer.style.backgroundImage='linear-gradient(rgba(20,15,35,'+config.scrim+'),rgba(20,15,35,'+config.scrim+')),url("'+config.image+'")';layer.style.backgroundSize=config.fit==="adaptive"?"100% 100%,cover":"100% 100%,"+config.fit;layer.style.backgroundColor=config.fit==="adaptive"?(dark?"#242033":"#ede4f7"):"transparent";scan();}
 function destroy(){
  active=false;clearTimeout(timer);observer?.disconnect();resize?.disconnect();
  document.querySelectorAll('#agy-dream-style-v2, #agy-dream-wallpaper-v2').forEach(el => el.remove());
  document.documentElement.classList.remove("agy-dream-active-v2");
  for(const entry of saved.reverse())restore(entry);
  saved.length=0;
  delete window[key];return{removed:true};
 }
 document.querySelectorAll("#agy-dream-wallpaper-v2").forEach(el => el.remove());
 document.head.append(style);document.body.prepend(layer);document.documentElement.classList.add("agy-dream-active-v2");
 update(config);observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true});resize=new ResizeObserver(schedule);resize.observe(root);
 const status=()=>({applied:active&&root.isConnected&&layer.isConnected&&style.isConnected,protected:root.querySelectorAll("[data-agy-dream-protect]").length,surfaces:root.querySelectorAll("[data-agy-dream-clear]").length,trackedChanges:saved.length});
 window[key]={update,destroy,status,owner:config.owner};return status();
}
module.exports={installTheme};
