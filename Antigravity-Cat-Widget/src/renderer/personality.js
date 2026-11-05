(function(root){
 class Personality{
  constructor(lines,random=Math.random,tags={}){this.lines=lines;this.random=random;this.previous=new Map();this.shyLines=new Set(tags.shy||[]);}
  say(state){const choices=this.lines[state]||this.lines.idle||["哼，本喵在呢。"];const available=choices.filter(line=>line!==this.previous.get(state));const pool=available.length?available:choices;const line=pool[Math.floor(this.random()*pool.length)%pool.length];this.previous.set(state,line);return line;}
  expressionFor(line){return this.shyLines.has(line)?"shy":null;}
 }
 if(typeof module==="object"&&module.exports)module.exports={Personality};else root.StarPersonality=Personality;
})(typeof window==="object"?window:globalThis);
