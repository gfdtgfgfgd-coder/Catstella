// 探测 web 端插件工程位置（分房后优先 worktree；可用 WEB_COMPANION_PATH 环境变量覆盖）。
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
function detectWebCompanion(){
 const candidates=[process.env.WEB_COMPANION_PATH,path.resolve(root,"../Gemini-Web-Companion"),path.resolve(root,"../Catstella-web/Gemini-Web-Companion")].filter(Boolean);
 for(const base of candidates){
  if(fs.existsSync(path.join(base,"scripts","build.js")))return{base,dist:path.join(base,"dist")};
 }
 return null;
}
module.exports={detectWebCompanion};
