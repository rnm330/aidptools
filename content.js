
(function(){

if (window.__taskCounterLoaded) return;
window.__taskCounterLoaded = true;

const DEFAULT_TARGET = 160;

const DEFAULT_SCHEDULE = [
{start:"10:00",end:"12:00"},
{start:"13:00",end:"19:00"}
];

function todayKey(){
return new Date().toISOString().slice(0,10);
}

function loadSettings(){
let raw = localStorage.getItem("tc_settings");
if(!raw){
return {target:DEFAULT_TARGET,schedule:DEFAULT_SCHEDULE};
}
try{return JSON.parse(raw)}catch{
return {target:DEFAULT_TARGET,schedule:DEFAULT_SCHEDULE};
}
}

function saveSettings(s){
localStorage.setItem("tc_settings",JSON.stringify(s));
}

function loadData(){
const raw = localStorage.getItem("taskCounterData");
if(!raw) return {};
try{return JSON.parse(raw);}catch{ return {}; }
}

function saveData(data){
localStorage.setItem("taskCounterData",JSON.stringify(data));
}

function getTodayCount(){
const data=loadData();
return data[todayKey()] || 0;
}

function setTodayCount(v){
const data=loadData();
data[todayKey()] = v;
saveData(data);
}

function addOne(){
setTodayCount(getTodayCount()+1);
updateUI();
}

function parseTime(t){
const [h,m]=t.split(":").map(Number);
const d=new Date();
d.setHours(h,m,0,0);
return d;
}

function getWorkedHours(){

let total=0;
const now=new Date();

for(const seg of settings.schedule){

let s=parseTime(seg.start);
let e=parseTime(seg.end);

if(now<=s) continue;

let end= now<e ? now : e;

total += (end-s)/3600000;

}

return Math.max(total,0);
}

function expected(){

const worked=getWorkedHours();

const totalHours = settings.schedule.reduce((a,b)=>{
const s=parseTime(b.start);
const e=parseTime(b.end);
return a+(e-s)/3600000;
},0);

return Math.floor((worked/totalHours)*settings.target);
}

let settings = loadSettings();

function progress(){

const done=getTodayCount();
const exp=expected();
const diff=done-exp;

let tip="";

if(diff>=4) tip="做题太快啦 🚀";
else if(diff<=-4) tip="抓紧做题 ⏰";

return {done,exp,tip};
}

function createUI(){

const bar=document.createElement("div");
bar.id="tc-bar";

bar.innerHTML=`
<div class="tc-wrap">

<div class="tc-left">

<div class="tc-stat">
<span class="tc-label">完成</span>
<input id="doneInput" type="number"/>
<span class="tc-divider">/</span>
<span id="target"></span>
</div>

<div class="tc-stat">
<span class="tc-label">应完成</span>
<span id="expected" class="tc-number"></span>
</div>

<div id="tip" class="tc-tip"></div>

</div>

<div class="tc-right">

<input id="taskIdInput" placeholder="任务ID"/>
<button id="jumpBtn">跳转</button>

<button id="settingsBtn" class="tc-ghost">设置</button>

</div>

</div>
`;

document.body.appendChild(bar);

createSettingsPanel();

document.getElementById("doneInput").addEventListener("input",e=>{
setTodayCount(Number(e.target.value)||0);
updateUI();
});

document.getElementById("jumpBtn").onclick=()=>{

const id=document.getElementById("taskIdInput").value.trim();
if(!id) return;

const url="https://aidp.bytedance.com/operation/task-v2/7583977724970585862/scan/2/"+id;
window.open(url,"_blank");
};

document.getElementById("settingsBtn").onclick=()=>{
document.getElementById("tc-settings").style.display="flex";
};

updateUI();

}

function createSettingsPanel(){

const panel=document.createElement("div");
panel.id="tc-settings";

panel.innerHTML=`
<div class="tc-modal">

<h3>工作设置</h3>

<label>每日目标</label>
<input id="setTarget" type="number"/>

<label>工作时间1</label>
<div class="tc-time">
<input id="t1s" type="time">
<span>-</span>
<input id="t1e" type="time">
</div>

<label>工作时间2</label>
<div class="tc-time">
<input id="t2s" type="time">
<span>-</span>
<input id="t2e" type="time">
</div>

<div class="tc-actions">
<button id="saveSettings">保存</button>
<button id="closeSettings" class="tc-ghost">取消</button>
</div>

</div>
`;

document.body.appendChild(panel);

document.getElementById("closeSettings").onclick=()=>{
panel.style.display="none";
};

document.getElementById("saveSettings").onclick=()=>{

settings.target = Number(document.getElementById("setTarget").value)||160;

settings.schedule=[
{start:document.getElementById("t1s").value,end:document.getElementById("t1e").value},
{start:document.getElementById("t2s").value,end:document.getElementById("t2e").value}
];

saveSettings(settings);

panel.style.display="none";
updateUI();
};

panel.addEventListener("click",e=>{
if(e.target===panel) panel.style.display="none";
});

fillSettings();
}

function fillSettings(){

document.getElementById("setTarget").value=settings.target;

document.getElementById("t1s").value=settings.schedule[0].start;
document.getElementById("t1e").value=settings.schedule[0].end;

document.getElementById("t2s").value=settings.schedule[1].start;
document.getElementById("t2e").value=settings.schedule[1].end;

}

function updateUI(){

const p=progress();

const doneInput=document.getElementById("doneInput");

if(doneInput && document.activeElement!==doneInput){
doneInput.value=p.done;
}

document.getElementById("target").innerText=settings.target;
document.getElementById("expected").innerText=p.exp;
document.getElementById("tip").innerText=p.tip;

}

function detectSubmit(){

document.addEventListener("click",e=>{

const btn=e.target.closest("button");
if(!btn) return;

if(btn.innerText.includes("提交")){
addOne();
}

});

}

function init(){

createUI();
detectSubmit();
setInterval(updateUI,60000);

}

if(document.readyState==="complete"){
init();
}else{
window.addEventListener("load",init);
}

})();
