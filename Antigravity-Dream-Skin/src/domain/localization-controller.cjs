// 界面汉化控制器：与主题化共用同一条 CDP 通道模式——发现宿主、注入 serialized 翻译层、按签名增量更新。
// 关闭语言时负责把宿主里的翻译层完整 destroy（原文还原），绝不残留。
const {discover,Cdp}=require("../../../shared/host.cjs");
const {installLocalization}=require("../host/localize.cjs");
class LocalizationController{
 constructor(onStatus,options={}){
  this.owner=require("node:crypto").randomUUID();
  this.onStatus=onStatus;this.discover=options.discover||discover;this.createClient=options.createClient||(url=>new Cdp(url));
  this.dict=options.dict&&typeof options.dict==="object"?options.dict:{};
  this.settings={uiLanguage:"en"};
  this.status={applied:false,message:"翻译层未启用"};
  this.signature=null;this.client=null;this.stopping=false;this.timer=null;
 }
 report(value){this.status={...this.status,...value};try{this.onStatus(this.status);}catch{}}
 update(settings){this.settings={...this.settings,...(settings||{})};return this.tick();}
 start(){clearInterval(this.timer);this.stopping=false;this.timer=setInterval(()=>this.tick(),3000);return this.tick();}
 async destroyInHost(){
  await this.client.evaluate("window.__agyZhV1&&window.__agyZhV1.owner==="+JSON.stringify(this.owner)+"?window.__agyZhV1.destroy():null");
 }
 async tick(){
  if(this.stopping)return;
  const enabled=this.settings.uiLanguage==="zh-CN";
  try{
   if(!enabled){
    if(this.client){try{await this.destroyInHost();}catch{}this.client.close();this.client=null;}
    if(this.signature!==null){this.signature=null;this.report({applied:false,message:"翻译层未启用"});}
    return;
   }
   if(!this.client||this.client.closed){
    const found=await this.discover();
    if(!found){if(this.signature!=="waiting")this.report({applied:false,message:"等待 Antigravity 连接后注入翻译层"});this.signature="waiting";return;}
    this.client=this.createClient(found.target.webSocketDebuggerUrl);this.signature=null;
   }
   const current=await this.client.evaluate("({ready:document.readyState,installed:!!window.__agyZhV1,owner:window.__agyZhV1&&window.__agyZhV1.owner})");
   if(current.installed&&current.owner!==this.owner){this.report({applied:false,message:"翻译层由另一个运行实例管理"});return;}
   const signature=JSON.stringify([this.settings.uiLanguage,this.dict]);
   if(!current.installed||signature!==this.signature){
    const result=await this.client.evaluate("("+installLocalization.toString()+")("+JSON.stringify({owner:this.owner,dict:this.dict})+")");
    this.signature=signature;
    this.report({applied:true,message:result&&result.applied?"汉化已注入 · 字典 "+Object.keys(this.dict).length+" 条":"宿主未就绪，稍后重试"});
   }
  }catch(error){
   if(this.client){try{this.client.close();}catch{}this.client=null;}
   this.signature=null;
   this.report({applied:false,message:"翻译层未接入："+error.message});
  }
 }
 async stop(){
  this.stopping=true;clearInterval(this.timer);
  try{if(this.client&&!this.client.closed)await this.destroyInHost();}catch{}
  if(this.client){try{this.client.close();}catch{}this.client=null;}
 }
}
module.exports={LocalizationController};
