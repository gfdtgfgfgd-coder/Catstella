// 一次性下载并静默安装 Inno Setup 命令行编译器到 tools/vendor/InnoSetup（官方 jrsoftware GitHub Releases）。
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),vendor=path.join(__dirname,'vendor/InnoSetup'),iscc=path.join(vendor,'ISCC.exe');
if(fs.existsSync(iscc)){console.log('Inno Setup 已就绪：'+iscc);process.exit(0);}
const version='7.1.1';
const url=`https://github.com/jrsoftware/issrc/releases/download/is-7_1_1/innosetup-${version}-x64.exe`;
console.log('下载 Inno Setup '+version+' …');
const tmp=path.join(require('node:os').tmpdir(),'innosetup-'+version+'-x64.exe');
execFileSync('curl',['-sL','--max-time','300','-o',tmp,url],{stdio:'inherit'});
fs.mkdirSync(vendor,{recursive:true});
execFileSync(tmp,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/DIR='+vendor],{stdio:'inherit'});
const islUrl='https://raw.githubusercontent.com/jrsoftware/issrc/main/Files/Languages/ChineseSimplified.isl';
execFileSync('curl',['-sL','--max-time','60','-o',path.join(vendor,'Languages/ChineseSimplified.isl'),islUrl],{stdio:'inherit'});
if(!fs.existsSync(iscc))throw Error('Inno Setup 安装后仍未找到 ISCC.exe');
console.log('✔ Inno Setup 就绪：'+iscc);
