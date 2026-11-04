// Serialized into the host by its existing local CDP endpoint (same channel as the theme). No host files are modified.
// 界面汉化翻译层：字典精确匹配替换可见文本节点与常见悬浮提示/占位符；输入区/代码区/终端绝对不碰；可随时 destroy 完整还原。
async function installLocalization(config){
 const key="__agyZhV1";
 if(window[key]){
  if(window[key].owner!==config.owner)throw new Error("翻译层由另一个运行实例管理");
  window[key].update(config);
  return window[key].status();
 }
 let dict=config.dict&&typeof config.dict==="object"?config.dict:{};
 const textSkip=".monaco-editor,.cm-editor,.xterm,.integrated-terminal,pre,code,script,style,textarea,input,[contenteditable=true],[role=textbox],[role=combobox]";
 const codeSkip=".monaco-editor,.cm-editor,.xterm,.integrated-terminal,pre,code,script,style";
 const textOriginals=[];
 const attrOriginals=[];
 let active=true,observer=null,timer=null,translatedCount=0;
 function restoreAll(){
  for(const entry of textOriginals)try{entry.node.nodeValue=entry.raw;}catch{}
  textOriginals.length=0;
  for(const entry of attrOriginals)try{entry.el.setAttribute(entry.attr,entry.raw);}catch{}
  attrOriginals.length=0;
  translatedCount=0;
 }
 function resolveHit(text){
  if(typeof text!=="string")return undefined;
  const trimmed=text.trim();
  if(!trimmed)return undefined;
  if(dict[trimmed]!==undefined)return text.replace(trimmed,dict[trimmed]);
  let m;
  if((m=trimmed.match(/^Version\s+([0-9.]+)$/i)))return text.replace(trimmed,"版本 "+m[1]);
  if((m=trimmed.match(/^Show\s+(\d+)\s+earlier\s+steps?$/i)))return text.replace(trimmed,"显示 "+m[1]+" 个较早步骤");
  if((m=trimmed.match(/^Worked for\s+(\d+[a-z]+)$/i)))return text.replace(trimmed,"已工作 "+m[1]);
  if((m=trimmed.match(/^(\d+[a-z]+)\s+ago$/i)))return text.replace(trimmed,m[1]+" 前");
  if((m=trimmed.match(/^(?:resets?|refresh) in\s+([^.]+)/i)))return text.replace(trimmed,m[1]+" 后重置");
  return undefined;
 }
 function translateNode(node){
  if(node.nodeType!==Node.TEXT_NODE)return;
  const parent=node.parentElement;
  if(!parent||parent.closest(textSkip))return;
  const raw=node.nodeValue;
  if(!raw)return;
  const hit=resolveHit(raw);
  if(hit===undefined||hit===raw)return;
  if(!textOriginals.some(entry=>entry.node===node))textOriginals.push({node,raw});
  node.nodeValue=hit;
  translatedCount++;
 }
 function translateAttr(el,attr){
  if(!el||el.closest(codeSkip))return;
  const raw=el.getAttribute(attr);
  if(!raw)return;
  const hit=resolveHit(raw);
  if(hit===undefined||hit===raw)return;
  if(!attrOriginals.some(entry=>entry.el===el&&entry.attr===attr))attrOriginals.push({el,attr,raw});
  el.setAttribute(attr,hit);
  translatedCount++;
 }
 function scan(root){
  if(!active||!root)return;
  if(root.nodeType===Node.TEXT_NODE){translateNode(root);return;}
  if(root.nodeType!==Node.ELEMENT_NODE)return;
  if(root.closest&&root.closest(textSkip)&&!root.matches("input,textarea,[placeholder],[title],[aria-label]"))return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
   acceptNode:n=>n.nodeValue&&resolveHit(n.nodeValue)!==undefined?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT
  });
  let node;
  while(node=walker.nextNode())translateNode(node);
  if(root.querySelectorAll){
   for(const el of root.querySelectorAll("[placeholder],[title],[aria-label]")){
    if(el.hasAttribute("placeholder"))translateAttr(el,"placeholder");
    if(el.hasAttribute("title"))translateAttr(el,"title");
    if(el.hasAttribute("aria-label"))translateAttr(el,"aria-label");
   }
  }
 }
 function rescan(){
  timer=null;
  if(!active)return;
  scan(document.body);
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(rescan,240);}
 function update(next){
  config=next;
  const nextDict=config.dict&&typeof config.dict==="object"?config.dict:{};
  const dictChanged=JSON.stringify(nextDict)!==JSON.stringify(dict);
  dict=nextDict;
  if(dictChanged)restoreAll();
  scan(document.body);
 }
 function destroy(){
  active=false;clearTimeout(timer);
  if(observer)observer.disconnect();
  restoreAll();
  delete window[key];
  return{removed:true};
 }
 scan(document.body);
 observer=new MutationObserver(schedule);
 observer.observe(document.body,{childList:true,subtree:true,characterData:true});
 const status=()=>({applied:active,translated:translatedCount,owner:config.owner});
 window[key]={update,destroy,status,owner:config.owner};
 return status();
}
module.exports={installLocalization};
