const{contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("dreamApi",{get:()=>ipcRenderer.invoke("dream:get"),save:v=>ipcRenderer.invoke("dream:save",v),refresh:()=>ipcRenderer.invoke("dream:refresh"),quit:()=>ipcRenderer.send("dream:quit"),subscribe:cb=>{const h=(_e,v)=>cb(v);ipcRenderer.on("dream:state",h);return()=>ipcRenderer.removeListener("dream:state",h);}});
