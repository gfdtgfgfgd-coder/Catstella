(function(root){
 class Personality{
  constructor(lines,random=Math.random,now=Date.now){this.lines=lines;this.random=random;this.now=now;this.previous=new Map();this.nextEggAt=now()+60000;}
  say(state){const choices=this.lines[state]||this.lines.idle||["哼，本喵在呢。"];const available=choices.filter(line=>line!==this.previous.get(state));const pool=available.length?available:choices;const line=pool[Math.floor(this.random()*pool.length)%pool.length];this.previous.set(state,line);return line;}
  reaction(context,manual=false,clicked=false){
   if(typeof manual!=="string"&&(!context.enabled||context.hidden||context.busy||!["idle","offline"].includes(context.state)))return null;
   const now=this.now();if(!manual&&((!clicked&&now<this.nextEggAt)||this.random()>=.15))return null;
   this.nextEggAt=now+180000;
   if(typeof manual==="string"){
    const normalized=manual==="sad"?"crying":manual;
    if(["proud","crying","shy","angry"].includes(normalized))return normalized;
   }
   const pool=clicked?["proud","shy","angry","crying"]:["proud","crying","shy"];
   return pool[Math.floor(this.random()*pool.length)%pool.length];
  }
 }
 if(typeof module==="object"&&module.exports)module.exports={Personality};else root.StarPersonality=Personality;
})(typeof window==="object"?window:globalThis);
