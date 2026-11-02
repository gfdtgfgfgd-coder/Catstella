// Serialized into the host by its existing local CDP endpoint (same channel as the theme). No host files are modified.
// 界面汉化翻译层：字典精确匹配替换可见文本节点；输入区/代码区/终端绝对不碰；可随时 destroy 完整还原。
async function installLocalization(config){
 const key="__agyZhV1";
 if(window[key]){
  if(window[key].owner!==config.owner)throw new Error("翻译层由另一个运行实例管理");
  window[key].update(config);
  return window[key].status();
 }
 const dict=config.dict&&typeof config.dict==="object"?config.dict:{};
 const skip=".monaco-editor,.cm-editor,.xterm,.integrated-terminal,pre,code,script,style,textarea,input,[contenteditable=true],[role=textbox],[role=combobox]";
 const originals=[];
 let active=true,observer=null,timer=null,translatedCount=0;
 function restoreAll(){
  for(const entry of originals)entry.node.nodeValue=entry.raw;
  originals.length=0;translatedCount=0;
 }
 function translateNode(node){
  if(node.nodeType!==Node.TEXT_NODE)return;
  const parent=node.parentElement;
  if(!parent||parent.closest(skip))return;
  const raw=node.nodeValue;
  if(!raw)return;
  const trimmed=raw.trim();
  if(!trimmed)return;
  const hit=dict[trimmed];
  if(hit===undefined)return;
  if(!originals.some(entry=>entry.node===node))originals.push({node,raw});
  node.nodeValue=raw.replace(trimmed,hit);
  translatedCount++;
 }
 function scan(root){
  if(!active||!root)return;
  if(root.nodeType===Node.TEXT_NODE){translateNode(root);return;}
  if(root.nodeType!==Node.ELEMENT_NODE)return;
  if(root.closest&&root.closest(skip))return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeValue&&n.nodeValue.trim()&&dict[n.nodeValue.trim()]!==undefined?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
  let node;
  while(node=walker.nextNode())translateNode(node);
 }
 function rescan(){
  timer=null;
  if(!active)return;
  scan(document.body);
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(rescan,240);}
 function update(next){
  config=next;
  const dictChanged=JSON.stringify(config.dict||{})!==JSON.stringify(dict);
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
