const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),http=require("node:http"),WebSocket=require("./vendor/ws");
function getJson(port,resource){return new Promise((resolve,reject)=>{const req=http.get({hostname:"127.0.0.1",port,path:resource,timeout:1800},res=>{let data="";res.on("data",b=>{data+=b;if(data.length>1048576)req.destroy();});res.on("end",()=>{try{resolve(JSON.parse(data));}catch{reject(new Error("宿主端点返回无效数据"));}});});req.on("timeout",()=>req.destroy(new Error("宿主响应超时")));req.on("error",reject);});}
async function discover(){
 const candidates=[path.join(process.env.APPDATA||path.join(os.homedir(),"AppData/Roaming"),"Antigravity/DevToolsActivePort"),path.join(os.homedir(),"Library/Application Support/Antigravity/DevToolsActivePort"),path.join(os.homedir(),".config/Antigravity/DevToolsActivePort")];
 for(const file of candidates)try{
  const port=Number(fs.readFileSync(file,"utf8").split("\n")[0]);
  if(!Number.isInteger(port)||port<1||port>65535)continue;
  const rawTargets=await getJson(port,"/json/list");
  const validTargets=(Array.isArray(rawTargets)?rawTargets:[]).filter(t=>t&&t.type==="page"&&/^https?:\/\/127\.0\.0\.1:\d+\//.test(t.url)&&/^ws:\/\/(127\.0\.0\.1|localhost):\d+\//.test(t.webSocketDebuggerUrl));
  if(validTargets.length)return{port,target:validTargets[0],targets:validTargets};
 }catch{}
 return null;
}
class Cdp{
 constructor(url,options={}){
  if(!/^ws:\/\/(127\.0\.0\.1|localhost):\d+\//.test(url))throw new Error("仅允许本机宿主");
  const handshakeTimeout=Number.isFinite(options.handshakeTimeout)?Math.max(20,Math.min(10000,options.handshakeTimeout)):4000;
  this.socket=new WebSocket(url,{maxPayload:5*1024*1024,handshakeTimeout});this.pending=new Map();this.id=0;this.closed=false;
  this.ready=new Promise((resolve,reject)=>{this.socket.once("open",resolve);this.socket.once("error",reject);});
  this.socket.on("message",raw=>{try{const m=JSON.parse(raw),p=this.pending.get(m.id);if(p){this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}}catch{}});
  this.socket.on("error",()=>{});this.socket.on("close",()=>{this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error("宿主已断开"));}this.pending.clear();});
 }
 async send(method,params={},timeout=7000){await this.ready;if(this.closed)throw new Error("宿主已断开");return new Promise((resolve,reject)=>{const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error("宿主操作超时"));},timeout);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
 async evaluate(expression,timeout=20000){const out=await this.send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true},timeout);if(out.exceptionDetails)throw new Error(out.exceptionDetails.exception?.description||out.exceptionDetails.text||"宿主执行失败");return out.result?.value;}
 close(){this.closed=true;this.socket.close();}
}
module.exports={discover,Cdp};
