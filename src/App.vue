<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

type Status = "pending" | "approved" | "rejected" | "archived" | "expired";
type Ad = { id:number; title:string; category:string; city:string; price:number; seller:string; contact:string; description:string; vk?:string|null; status:Status; createdAt:string; expiresAt?:string|null };
type Report = { id:number; ad_id:number; reporter_nickname:string; reason:string; status:string; created_at:string; title:string };
type Log = { id:number; ad_id:number; moderator_nickname:string; action:string; comment:string|null; created_at:string };

const categories = ["Все","Автомобили","Недвижимость","Работа","Услуги","Бизнесы","Другое"];
const cities = ["Все","Los Santos","San Fierro","Las Venturas"];

const houseClasses = [
  "Дом 1-го класса",
  "Дом 2-го класса",
  "Дом 3-го класса",
  "Дом 4-го класса",
  "Дом 5-го класса",
  "Дом 6-го класса",
  "Дом 7-го класса"
];

const businessTypes = [
  "Автомастерская / СТО",
  "Автосалон Эконом",
  "Автосалон Комфорт",
  "Автосалон Элитный",
  "АЗС",
  "Бар",
  "Велосалон",
  "Мотосалон",
  "Воздушный парк",
  "Воздушные RC игрушки / RC игрушки",
  "Магазин джетпаков",
  "Закусочная",
  "Корабль",
  "Магазин аксессуаров",
  "Магазин одежды",
  "Магазин попугаев",
  "Магазин Hippi",
  "Магазин 24/7",
  "Оружейный магазин",
  "Парашютные прыжки",
  "Парикмахерская",
  "Пенёк",
  "Пиротехника",
  "Риэлторское агентство",
  "Рыболовный магазин",
  "Табачный магазин",
  "Фабрика интерьеров"
];

const houseDistricts = [
  "г. Лос-Сантос",
  "г. Сан-Фиерро",
  "г. Лас-Вентурас",
  "Опасный район",
  "гора VineWood",
  "пляж Санта-Мария",
  "Военный городок",
  "пригород г. Лос-Сантос",
  "пригород г. Сан-Фиерро",
  "пригород г. Лас-Вентурас",
  "район Angel Pine",
  "район Prickle Pine",
  "район Palomino Creek",
  "район Montgomery",
  "район Fort Carson",
  "пляж Верона",
  "в районе Рыболовного пирса",
  "в районе Рыболовного пирса г. Лас-Вентурас",
  "у казино Четыре дракона",
  "у казино Калигула",
  "у казино Floor",
  "возле авианосца",
  "возле спортзала г. Лос-Сантос",
  "возле спортзала г. Лас-Вентурас",
  "возле спортзала г. Сан-Фиерро",
  "возле автосалона",
  "возле горы Чилиад",
  "возле Радиоцентра г. Лас-Вентурас",
  "возле Радиоцентра г. Лос-Сантос",
  "возле Радиоцентра г. Сан-Фиерро",
  "возле Полиции г. Лас-Вентурас",
  "возле Полиции г. Лос-Сантос",
  "возле Полиции г. Сан-Фиерро",
  "возле Больницы г. Лас-Вентурас",
  "возле Больницы г. Лос-Сантос",
  "возле Больницы г. Сан-Фиерро",
  "возле Мэрии г. Лас-Вентурас",
  "возле Мэрии г. Лос-Сантос",
  "возле Мэрии г. Сан-Фиерро",
  "возле базы Военно-Морского флота",
  "возле базы Сухопутных Войск",
  "возле базы Военно-Воздушных сил",
  "возле ресторана русской кухни",
  "возле ресторана итальянской кухни",
  "возле ресторана японской кухни",
  'возле спорт-клуба "The Rifa Gang"',
  'возле спорт-клуба "Varios Los Aztecas"',
  'возле спорт-клуба "Los Santos Vagos"',
  'возле спорт-клуба "Grove Street Gang"',
  'возле спорт-клуба "The Ballas Gang"'
];

const carGroups = [
  { title: "Автомобили", items: [
    "Acura","Admiral","Alpha","Baggage","Banshee","Bandito","BF Injection","Blade","Blista Compact","Bloodring Banger","Bobcat","Bravura","Broadway","Buccaneer","Buffalo","Bullet","Burrito","Caddy","Cadrona","Camper","Cheetah","Clover","Club","Comet","Elegant","Elegy","Emperor","Esperanto","Euros","Feltzer","Flash","Fortune","Glendale","Greenwood","Hermes","Hotknife","Hotring Racer","Huntley","Hustler","Infernus","Intruder","Kart","Landstalker","Majestic","Manana","Merit","Moonbeam","Mower","Nebula","Oceanic","Perennial","Phoenix","Picador","Pony","Premier","Previon","Primo","Rancher","Regina","Remington","Romero","Rumpo","Jester","Journey","Sabre","Sadler","Sandking","Savanna","Sentinel","Slamvan","Solair","Sultan","Super GT","Stafford","Stallion","Stratum","Stretch","Sunrise","Tahoma","Tampa","Tornado","Tug","Turismo","Uranus","Vincent","Virgo","Voodoo","Washington","Willard","Windsor","Yosemite","ZR-350"
  ]},
  { title: "Уникальные автомобили", items: [
    "Ambulance","BMW M5 F90","Dodge Challenger SRT-8","Dozer","Duneride","Dumper","Enforcer","FBI Rancher","FBI Truck","Fire Truck","Fire Truck LA","Mesa","Monster Truck","Mazda RX-8","Patriot","Packer","Police Car (LS/SF/LV)","Police Ranger","Roadtrain","Taxi","Tractor","Trashmaster"
  ]},
  { title: "Премиум автомобили", items: [
    "Audi Q8r / Audi Q8R","BMW M3 E46","BMW M2 F87","Cadillac XT6","Chevrolet Camaro","Chevrolet Caprice","Chevrolet Corvette C6","Chevrolet Tahoe","Chevrolet Impala 2018","Dodge Charger","Dodge Charger R.T","Delorean DMC 12","Ford Crown Victoria","Ford Explorer","Ford Taurus","Ford Shelby Mustang","Ferrari 488 GTB","Hummer H2","Honda Civic Gen 3","Infinity FX35","Jeep Cherokee SRT WK1","Lada 2107","Lada Priora","Lexus IS300","Lexus LS500","Mercedes-Benz E-Сlass / Mercedes Benz E Сlass","Mercedes Benz 190E","Mercedes Benz W124","Mercedes R129","Mitsubishi Lancer Evo X","Mitsubishi Lancer Evo IX","Mitsubishi 3000GT","Range Rover","Subaru Impreza STI","Toyota Camry 3.5","Toyota Supra A80","Toyota Corolla GT-S","Volkswagen Passat CC"
  ]},
  { title: "Донатные автомобили", items: [
    "Aston Martin DB11","Audi R8","Lamborghini Gallardo","Mercedes-Benz SL65 / Mercedes Benz SL65","Mercedes-Benz G-Class / Mercedes Benz G Class","Mercedes Benz SLS AMG","Porsche 911 GT2","Rolls-Royce Phantom","Toyota Supra A90"
  ]},
  { title: "Мотоциклы", items: ["BF-400","Faggio","FCR-900","Freeway","NRG-500","Pizzaboy","PCJ-600","Sanchez","Wayfarer"]},
  { title: "Премиум мотоциклы", items: ["Chopper","BMW RT / BMW R1200RT","Electra Glide","FCR Pegassi / Pegassi FCR 1000","Honda DIO","Honda Hornet / Honda Hornet C8600F","Honda XRE / Honda XRE 300","Kawasaki NRR / Kawasaki NRR 1000","Kawasaki FX / Kawasaki Z400 FX","NRG-500 RR / NRG-500RR"]},
  { title: "Квадроциклы", items: ["Quad","Honda Sportrax / Honda Sportrax 250ex(EX)"]},
  { title: "Велосипеды", items: ["Bike","BMX","Mountain Bike","Penny farthing"]}
];
const carNames = carGroups.flatMap(group => group.items);
const tuningOptions = ["[У]","[У200П]","[П]","[Э]","[К]","[М]","[ЭП]","[БП]","[БЭП]","[Б200]","[БЭ200П]","[БПК]","[БЭПК]","[БК200]","[БЭК200П]","[Б]","[БЭ]","[200]","[200П]","[Full]"];
const stageOptions = ["","1/3","2/3","3/3"];
const search=ref(""); const activeCategory=ref("Все"); const activeCity=ref("Все");
const minPrice=ref(""); const maxPrice=ref(""); const sort=ref("newest");
const ads=ref<Ad[]>([]); const loading=ref(true); const apiOnline=ref(false);
const showRules=ref(false); const showCreate=ref(false); const showReport=ref<Ad|null>(null); const reportText=ref(""); const reportNick=ref("");
const showMediaLogin=ref(false); const showMediaPanel=ref(false); const mediaError=ref(""); const mediaUser=ref(""); const mediaRole=ref<"admin"|"root"|"">(""); const isAdmin=ref(false); const logScope=ref("own");
const mediaStatus=ref<Status|"all">("pending"); const mediaAds=ref<Ad[]>([]); const reports=ref<Report[]>([]); const logs=ref<Log[]>([]); const stats=ref<Record<string,number>>({});
const editAd=ref<Ad|null>(null); const editForm=ref<any>({}); const rejectAdTarget=ref<Ad|null>(null); const rejectReason=ref("");

const form=ref({title:"",category:"Автомобили",city:"Los Santos",price:"",seller:"",contact:"",description:"",vk:"",tuning:"",accelerationStage:"",speedStage:"",district:""});
const autoGeneratedDescription=ref("");
const manualDescription=ref("");
const login=ref({username:"",password:""});

const filteredAds=computed(()=>{
  const q=search.value.trim().toLowerCase(); const min=Number(minPrice.value)||0; const max=Number(maxPrice.value)||Infinity;
  const result=ads.value.filter(ad=>{
    const text=`${ad.title} ${ad.category} ${ad.city} ${ad.seller} ${ad.description}`.toLowerCase();
    return (!q||text.includes(q)) && (activeCategory.value==="Все"||ad.category===activeCategory.value) && (activeCity.value==="Все"||ad.city===activeCity.value) && ad.price>=min && ad.price<=max;
  });
  return result.sort((a,b)=>sort.value==="priceAsc"?a.price-b.price:sort.value==="priceDesc"?b.price-a.price:b.id-a.id);
});
const pendingAds=computed(()=>mediaStatus.value==="all"?mediaAds.value:mediaAds.value.filter(a=>a.status===mediaStatus.value));

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function money(v:number){return v?`${new Intl.NumberFormat("ru-RU").format(v)} $`:"Договорная";}
async function loadAds(){loading.value=true;try{const r=await fetch("/api/ads");const d=await r.json();ads.value=d.ads??[];apiOnline.value=r.ok;}catch{apiOnline.value=false;ads.value=[];}finally{loading.value=false;}}
async function checkSession(openPanel=false){try{const r=await fetch("/api/media/me");const d=await r.json();if(d.authenticated){mediaUser.value=d.user.nickname;mediaRole.value=d.user.role;isAdmin.value=true;if(openPanel){showMediaPanel.value=true;await loadMedia();}}else{isAdmin.value=false;mediaUser.value="";mediaRole.value="";}}catch{isAdmin.value=false;}}
function tuningText(value:string){return value.replace(/^\[|\]$/g,"");}

// VK хранится в отдельном поле ads.vk. Пользователь вводит только username,
// а приложение сохраняет полный адрес https://vk.com/username.
function normalizeVk(value:string){
  const raw=String(value||"").trim();
  if(!raw)return "";
  let v=raw.replace(/^https?:\/\/(?:www\.)?vk\.com\//i, "").replace(/^vk\.com\//i, "").replace(/^@/, "").replace(/^\//, "").trim();
  if(!v || /[\s\]]/.test(v))return "";
  return `https://vk.com/${v}`;
}

function displayDescription(description:string){
  return String(description||"").replace(/\s*\[\[VK:\/(?:[^\]\s]+)\]\]/gi, "").replace(/\n{3,}/g, "\n\n").trim();
}

function getVkLink(ad:Pick<Ad,"vk"|"description">){
  // Основной источник — описание объявления, потому что оно гарантированно
  // проходит тот же путь, что и остальной текст: создание → БД → СМИ → публикация.
  const descriptionMatch=String(ad.description||"").match(/\[\[VK:(\/[^\]\s]+)\]\]/i);
  if(descriptionMatch){
    return `https://vk.com${descriptionMatch[1]}`;
  }

  // Обратная совместимость с объявлениями, где VK уже хранится в ads.vk.
  const direct=normalizeVk(ad.vk||"");
  return direct || "";
}

function rebuildAutoDescription(){
  const lines:string[]=[];
  if(form.value.category==="Автомобили"){
    if(form.value.tuning) lines.push(`Тюнинг - ${tuningText(form.value.tuning)};`);
    if(form.value.accelerationStage) lines.push(`Ускорение - ${form.value.accelerationStage.split("/")[0]};`);
    if(form.value.speedStage) lines.push(`Скорость - ${form.value.speedStage.split("/")[0]};`);
  } else if(form.value.category==="Недвижимость" || form.value.category==="Бизнесы"){
    if(form.value.district) lines.push(`Район - ${form.value.district};`);
  }
  const generated=lines.join("\n");
  autoGeneratedDescription.value=generated;
  form.value.description=generated ? generated + (manualDescription.value ? `\n${manualDescription.value}` : "") : manualDescription.value;
}

function onDescriptionInput(){
  const visible=form.value.description;
  const generated=autoGeneratedDescription.value;
  if(generated && visible.startsWith(generated)){
    manualDescription.value=visible.slice(generated.length).replace(/^\n/,"");
  } else if(!generated){
    manualDescription.value=visible;
  }
}

function chooseCategory(category:string){
  form.value.category=category;
  form.value.tuning=""; form.value.accelerationStage=""; form.value.speedStage=""; form.value.district="";
  
  if(category==="Недвижимость" || category==="Бизнесы" || category==="Другое"){
    form.value.city="";
  } else {
    if(!form.value.city) form.value.city="Los Santos";
  }

  if(category==="Недвижимость") {
    form.value.title=houseClasses[0];
  } else if(category==="Бизнесы") {
    form.value.title=businessTypes[0];
  } else {
    form.value.title="";
  }

  manualDescription.value=form.value.description;
  rebuildAutoDescription();
}

function resetCreateForm(){
  form.value={title:"",category:"Автомобили",city:"Los Santos",price:"",seller:"",contact:"",description:"",vk:"",tuning:"",accelerationStage:"",speedStage:"",district:""};
  autoGeneratedDescription.value=""; manualDescription.value="";
}

async function createAd(){
  if(!form.value.title||!form.value.seller||!form.value.contact)return;

  const normalizedVk=normalizeVk(form.value.vk);
  let description=form.value.description.slice(0,500);

  // Храним VK тем же способом, что и служебные данные автомобиля/района:
  // внутри description. Поэтому он гарантированно доходит до панели СМИ
  // и до опубликованного объявления даже без отдельной колонки в БД.
  if(normalizedVk){
    const username=normalizedVk.replace(/^https?:\/\/vk\.com\//i,"");
    const marker=`[[VK:/${username}]]`;

    // Не дублируем маркер, если функция будет вызвана повторно.
    description=description.replace(/\s*\[\[VK:\/[^\]\s]+\]\]/gi,"").trim();
    description=description ? `${description}\n${marker}` : marker;
  }

  const payload={
    ...form.value,
    price:Number(form.value.price||0),
    description,
    // Оставляем и отдельное поле для совместимости с текущим server.js.
    vk:normalizedVk
  };

  if(payload.category!=="Автомобили"){
    delete (payload as any).tuning;
    delete (payload as any).accelerationStage;
    delete (payload as any).speedStage;
  }

  if(payload.category!=="Недвижимость" && payload.category!=="Бизнесы"){
    delete (payload as any).district;
  }

  try{
    const r=await fetch("/api/ads",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify(payload)
    });

    const data=await r.json().catch(()=>null);

    if(!r.ok){
      alert(data?.error || "Не удалось отправить объявление.");
      return;
    }

    showCreate.value=false;
    resetCreateForm();
    await loadAds();
    alert("Объявление отправлено на проверку СМИ.");
  }catch(error){
    console.error("createAd:",error);
    alert("Не удалось подключиться к серверу.");
  }
}

async function openMediaLogin(){mediaError.value="";if(isAdmin.value){showMediaPanel.value=true;localStorage.setItem("tm_media_panel","1");await loadMedia();return;}await checkSession(false);if(isAdmin.value){showMediaPanel.value=true;localStorage.setItem("tm_media_panel","1");await loadMedia();}else showMediaLogin.value=true;}
function collapseMediaPanel(){showMediaPanel.value=false;localStorage.removeItem("tm_media_panel");}
async function loadMedia(){const [a,s,r,l]=await Promise.all([fetch(`/api/media/ads?status=${mediaStatus.value==='all'?'pending':mediaStatus.value}`),fetch("/api/media/stats"),fetch("/api/media/reports"),fetch("/api/media/logs")]);if([a,s,r,l].some(x=>x.status===401)){isAdmin.value=false;showMediaPanel.value=false;openMediaLogin();return;}mediaAds.value=(await a.json()).ads??[];stats.value=await s.json();reports.value=(await r.json()).reports??[];const logData=await l.json();logs.value=logData.logs??[];logScope.value=logData.scope??"own";}
async function mediaLogin(){mediaError.value="";try{const r=await fetch("/api/media/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(login.value)});const d=await r.json().catch(()=>null);if(!r.ok){mediaError.value=d?.error||"Неверный логин или пароль.";return;}mediaUser.value=d.user.nickname;mediaRole.value=d.user.role;isAdmin.value=true;showMediaLogin.value=false;showMediaPanel.value=true;login.value={username:"",password:""};localStorage.setItem("tm_media_panel","1");await loadMedia();}catch{mediaError.value="Не удалось подключиться к серверу.";}}
async function setMediaStatus(status:Status|"all"){mediaStatus.value=status;await loadMedia();}
async function action(id:number,action:"approve"|"archive",body:any={}){const r=await fetch(`/api/media/ads/${id}/${action}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});if(!r.ok){alert((await r.json().catch(()=>null))?.error||"Ошибка");return;}await loadMedia();await loadAds();}
async function approve(ad:Ad){await action(ad.id,"approve");}
function openReject(ad:Ad){rejectAdTarget.value=ad;rejectReason.value="";}
async function reject(){if(!rejectAdTarget.value||!rejectReason.value.trim())return;await action(rejectAdTarget.value.id,"reject",{reason:rejectReason.value});rejectAdTarget.value=null;}
async function archive(ad:Ad){if(confirm("Снять это объявление с публикации?"))await action(ad.id,"archive");}
function openEdit(ad:Ad){
  editAd.value=ad;

  // VK сначала читаем из description-маркера, затем из отдельного поля.
  // Редактор получает обычный username без служебного формата.
  const vkLink=getVkLink(ad);
  const vkUsername=vkLink.replace(/^https?:\/\/vk\.com\//i,"");

  editForm.value={
    title:ad.title,
    category:ad.category,
    city:ad.city,
    price:ad.price,
    contact:ad.contact,
    seller:ad.seller,
    description:displayDescription(ad.description),
    vk:vkUsername
  };
}
async function saveEdit(){
  if(!editAd.value)return;

  const normalizedVk=normalizeVk(editForm.value.vk||"");
  let description=displayDescription(editForm.value.description).slice(0,500);

  // Сохраняем VK обратно в description, чтобы после редактирования
  // он гарантированно оставался доступен во всех местах.
  if(normalizedVk){
    const username=normalizedVk.replace(/^https?:\/\/vk\.com\//i,"");
    const marker=`[[VK:/${username}]]`;
    description=description.replace(/\s*\[\[VK:\/[^\]\s]+\]\]/gi,"").trim();
    description=description ? `${description}\n${marker}` : marker;
  }

  const payload={
    ...editForm.value,
    description,
    vk:normalizedVk
  };

  const r=await fetch(`/api/media/ads/${editAd.value.id}`,{
    method:"PATCH",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(payload)
  });

  if(!r.ok){
    alert((await r.json().catch(()=>null))?.error||"Не удалось сохранить");
    return;
  }

  editAd.value=null;
  await loadMedia();
  await loadAds();
}
async function deleteAd(ad:Ad){if(!confirm(`Удалить объявление «${ad.title}» навсегда?`))return;const r=await fetch(`/api/media/ads/${ad.id}`,{method:"DELETE"});const d=await r.json().catch(()=>null);if(!r.ok){alert(d?.error||"Не удалось удалить объявление");return;}await loadAds();if(showMediaPanel.value)await loadMedia();}
async function reportAd(){if(!showReport.value||!reportText.value.trim())return;const r=await fetch("/api/ads/report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({adId:showReport.value.id,reporter:reportNick.value||"Аноним",reason:reportText.value})});if(r.ok){showReport.value=null;reportText.value="";reportNick.value="";alert("Жалоба отправлена в СМИ.");}else alert((await r.json().catch(()=>null))?.error||"Ошибка");}
async function resolveReport(id:number,action:"resolve"|"dismiss"){await fetch("/api/media/reports/resolve",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,action})});await loadMedia();}
async function logoutMedia(){await fetch("/api/media/logout",{method:"POST"}).catch(()=>{});showMediaPanel.value=false;showMediaLogin.value=false;mediaUser.value="";mediaRole.value="";isAdmin.value=false;mediaAds.value=[];localStorage.removeItem("tm_media_panel");}
onMounted(async()=>{await loadAds();await checkSession(false);if(isAdmin.value&&localStorage.getItem("tm_media_panel")==="1"){showMediaPanel.value=true;await loadMedia();}});
</script>

<template>
<div class="app-shell">
<header class="topbar"><div class="brand"><div class="brand-mark"><img src="/logo.png" alt="Titanium Market"></div><div><div class="brand-title">TITANIUM MARKET</div><div class="brand-subtitle">Официальная доска объявлений штата</div></div></div>
<div class="top-actions"><button class="media-link" @click="showRules=true">Правила</button><button class="media-link" @click="showMediaPanel?showMediaPanel=false:openMediaLogin()">Панель СМИ</button><button class="btn btn-primary" @click="showCreate=true">+ Подать объявление</button></div></header>
<main>
<section class="hero"><div><div class="eyebrow">ЭЛЕКТРОННАЯ ПЛОЩАДКА ШТАТА</div><h1>Найди. Купи.<br><span>Продай.</span></h1><p>Автомобили, недвижимость, работа, услуги и готовый бизнес — всё в одном месте.</p></div><div class="hero-stat"><strong>{{filteredAds.length}}</strong><span>доступных объявлений</span></div></section>
<section class="controls"><div class="search"><span>⌕</span><input v-model="search" placeholder="Поиск по названию, нику, городу или описанию..."></div><div class="filter-row"><select v-model="activeCity"><option v-for="c in cities" :key="c">{{c}}</option></select><input v-model="minPrice" type="number" min="0" placeholder="Цена от"><input v-model="maxPrice" type="number" min="0" placeholder="Цена до"><select v-model="sort"><option value="newest">Сначала новые</option><option value="priceAsc">Сначала дешёвые</option><option value="priceDesc">Сначала дорогие</option></select></div><div class="categories"><button v-for="category in categories" :key="category" :class="{active:activeCategory===category}" @click="activeCategory=category">{{category}}</button></div></section>
<section class="section-head"><div><div class="section-kicker">АКТУАЛЬНЫЕ ПРЕДЛОЖЕНИЯ</div><h2>Объявления</h2></div><span class="result-count">{{filteredAds.length}} найдено</span></section>
<section v-if="loading" class="empty">Загружаем объявления...</section><section v-else-if="filteredAds.length" class="grid"><article v-for="ad in filteredAds" :key="ad.id" class="card"><div class="card-top"><span class="tag">{{ad.category}}</span><span class="date">{{formatDate(ad.createdAt)}}</span></div><h3>{{ad.title}}</h3><div class="price">{{money(ad.price)}}</div><p>{{displayDescription(ad.description)}}</p><div class="card-bottom"><div><div class="seller">{{ad.seller}}</div><div class="city">Телефон: {{ad.contact}}</div></div><div class="card-actions"><a v-if="getVkLink(ad)" class="more vk-link" :href="getVkLink(ad)" target="_blank" rel="noopener noreferrer" title="Открыть VK" aria-label="Открыть VK" style="display:inline-flex !important;align-items:center !important;justify-content:center !important;text-decoration:none !important;font-size:16px !important;line-height:1 !important;padding:0 !important;">VK</a><button v-if="isAdmin" class="more admin-edit" @click="openEdit(ad)">✎</button><button v-if="isAdmin" class="more admin-delete" @click="deleteAd(ad)">×</button><button class="more" @click="showReport=ad">⚑</button></div></div></article></section><section v-else class="empty">По вашему запросу ничего не найдено.</section>
</main>
<footer><span>TITANIUM MARKET</span><span>Официальная электронная площадка объявлений</span></footer>

<div v-if="showRules" class="modal-backdrop" @click.self="showRules=false"><section class="modal rules-modal"><div class="modal-head"><div><div class="section-kicker">ПРАВИЛА ПЛОЩАДКИ</div><h2>Правила Titanium Market</h2></div><button type="button" class="close" @click="showRules=false">×</button></div><div class="rules-content"><div class="rules-block"><h3>✅ Разрешено</h3><ul><li>Размещать объявления о продаже и покупке автомобилей, недвижимости, бизнеса, работе и услугах.</li><li>Указывать актуальную и достоверную информацию.</li><li>Использовать корректные цены и контактные данные.</li><li>Размещать несколько объявлений, если они относятся к разным предложениям.</li></ul></div><div class="rules-block"><h3>❌ Запрещено</h3><ul><li>Ложная или вводящая в заблуждение информация.</li><li>Спам и одинаковые объявления.</li><li>Оскорбления, угрозы и провокации.</li><li>Реклама сторонних проектов без разрешения администрации.</li><li>Размещение объявлений не по соответствующей категории.</li><li>Любые предложения, нарушающие правила сервера.</li></ul></div></div></section></div>

<div v-if="showCreate" class="modal-backdrop" @click.self="showCreate=false">
  <form class="modal" @submit.prevent="createAd">
    <div class="modal-head">
      <div>
        <div class="section-kicker">НОВОЕ ОБЪЯВЛЕНИЕ</div>
        <h2>Подать объявление</h2>
      </div>
      <button type="button" class="close" @click="showCreate=false">×</button>
    </div>

    <div class="notice">После отправки объявление будет проверено сотрудником СМИ.</div>

    <div style="margin-top: 20px;">
      <div style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 8px !important;">Категория</div>
      <div class="categories modal-categories">
        <button v-for="c in categories.slice(1)" :key="c" type="button" :class="{active:form.category===c}" @click="chooseCategory(c)">{{c}}</button>
      </div>
    </div>

    <template v-if="form.category==='Автомобили'">
      <div class="form-row" style="margin-top: 16px;">
        <div>
          <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Марка / Модель авто</label>
          <input v-model="form.title" list="vehicle-names" required maxlength="80" placeholder="Начните вводить название авто..." style="font-size: 13px !important;">
          <datalist id="vehicle-names">
            <option v-for="car in carNames" :key="car" :value="car"></option>
          </datalist>
        </div>
        <div>
          <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Тюнинг</label>
          <select v-model="form.tuning" @change="rebuildAutoDescription" style="font-size: 13px !important;">
            <option value="">Без тюнинга</option>
            <option v-for="t in tuningOptions" :key="t" :value="t">{{t}}</option>
          </select>
        </div>
      </div>

      <div class="form-row" style="margin-top: 16px;">
        <div>
          <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Ускорение</label>
          <select v-model="form.accelerationStage" @change="rebuildAutoDescription" style="font-size: 13px !important;">
            <option value="">Не выбран</option>
            <option v-for="s in stageOptions.slice(1)" :key="s" :value="s">{{s}}</option>
          </select>
        </div>
        <div>
          <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Скорость</label>
          <select v-model="form.speedStage" @change="rebuildAutoDescription" style="font-size: 13px !important;">
            <option value="">Не выбран</option>
            <option v-for="s in stageOptions.slice(1)" :key="s" :value="s">{{s}}</option>
          </select>
        </div>
      </div>
    </template>

    <template v-else-if="form.category==='Недвижимость'">
      <div class="form-row" style="margin-top: 16px;">
        <div>
          <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Название</label>
          <select v-model="form.title" required style="font-size: 13px !important;">
            <option v-for="hc in houseClasses" :key="hc" :value="hc">{{hc}}</option>
          </select>
        </div>
        <div>
          <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Район</label>
          <select v-model="form.district" @change="rebuildAutoDescription" style="font-size: 13px !important;">
            <option value="">Не выбран</option>
            <option v-for="d in houseDistricts" :key="d" :value="d">{{d}}</option>
          </select>
        </div>
      </div>
    </template>

    <template v-else-if="form.category==='Бизнесы'">
      <div class="form-row" style="margin-top: 16px;">
        <div>
          <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Название</label>
          <select v-model="form.title" required style="font-size: 13px !important;">
            <option v-for="b in businessTypes" :key="b" :value="b">{{b}}</option>
          </select>
        </div>
        <div>
          <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Район</label>
          <select v-model="form.district" @change="rebuildAutoDescription" style="font-size: 13px !important;">
            <option value="">Не выбран</option>
            <option v-for="d in houseDistricts" :key="d" :value="d">{{d}}</option>
          </select>
        </div>
      </div>
    </template>

    <template v-else-if="form.category==='Другое'">
      <div style="margin-top: 16px;">
        <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Название</label>
        <input v-model="form.title" required maxlength="80" placeholder="Название объявления..." style="font-size: 13px !important;">
      </div>
    </template>

    <template v-else>
      <div style="margin-top: 16px;">
        <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Город</label>
        <select v-model="form.city" style="font-size: 13px !important;">
          <option v-for="c in cities.slice(1)" :key="c">{{c}}</option>
        </select>
      </div>
      <div style="margin-top: 16px;">
        <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Название</label>
        <input v-model="form.title" required maxlength="80" placeholder="Название объявления..." style="font-size: 13px !important;">
      </div>
    </template>

    <div class="form-row" style="margin-top: 16px;">
      <div>
        <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Цена</label>
        <input v-model="form.price" type="number" min="0" placeholder="1500000" style="font-size: 13px !important;">
      </div>
      <div>
        <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Игровой ник</label>
        <input v-model="form.seller" required maxlength="32" placeholder="Nick_Name" style="font-size: 13px !important;">
      </div>
    </div>

    <div style="margin-top: 16px;">
      <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Контакт</label>
      <input v-model="form.contact" required maxlength="40" placeholder="555-1234" style="font-size: 13px !important;">
    </div>

    <div style="margin-top: 16px;">
      <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">VK <span style="font-weight: 400 !important; color: #626772 !important;">необязательно</span></label>
      <input v-model="form.vk" maxlength="120" placeholder="username" style="font-size: 13px !important;">
    </div>

    <div style="margin-top: 16px;">
      <label style="font-size: 13px !important; font-weight: 600 !important; color: #8b909b !important; margin-bottom: 6px !important; display: block !important;">Описание</label>
      <textarea v-model="form.description" @input="onDescriptionInput" rows="4" maxlength="500" placeholder="Расскажите подробнее..." style="font-size: 13px !important;"></textarea>
    </div>

    <button class="btn btn-primary submit" type="submit" style="margin-top: 24px;">Отправить на проверку</button>
  </form>
</div>

<div v-if="showReport" class="modal-backdrop" @click.self="showReport=null"><form class="modal" @submit.prevent="reportAd"><div class="modal-head"><div><div class="section-kicker">ЖАЛОБА</div><h2>Пожаловаться</h2></div><button type="button" class="close" @click="showReport=null">×</button></div><p class="modal-description">Объявление: <b>{{showReport.title}}</b></p><label>Ваш игровой ник<input v-model="reportNick" maxlength="32" placeholder="Nick_Name"></label><label>Причина<textarea v-model="reportText" required maxlength="300" rows="4" placeholder="Почему объявление нарушает правила?"></textarea></label><button class="btn btn-primary submit">Отправить жалобу</button></form></div>

<div v-if="showMediaLogin" class="modal-backdrop" @click.self="showMediaLogin=false"><form class="modal media-modal" @submit.prevent="mediaLogin"><div class="modal-head"><div><div class="section-kicker">ЗАКРЫТЫЙ РАЗДЕЛ</div><h2>Панель СМИ</h2></div><button type="button" class="close" @click="showMediaLogin=false">×</button></div><p class="modal-description">Доступ только для сотрудников СМИ.</p><label>Логин<input v-model="login.username"></label><label>Пароль<input v-model="login.password" type="password"></label><div v-if="mediaError" class="login-error">{{mediaError}}</div><button class="btn btn-primary submit">Войти</button><div class="login-hint">После входа сессия сохраняется на этом устройстве.</div></form></div>

<div v-if="showMediaPanel" class="modal-backdrop panel-backdrop"><section class="media-panel"><div class="panel-header"><div><div class="section-kicker">MEDIA CONTROL</div><h2>Панель СМИ</h2></div><div class="panel-actions"><span class="logged-user">{{mediaUser}} · {{mediaRole === "root" ? "ROOT" : "СМИ"}}</span><button class="btn btn-secondary" @click="collapseMediaPanel">Свернуть</button><button class="btn btn-secondary" @click="logoutMedia">Выйти</button></div></div>
<div class="stats"><div class="stat-box"><strong>{{stats.pending||0}}</strong><span>На проверке</span></div><div class="stat-box green"><strong>{{stats.approved||0}}</strong><span>Опубликовано</span></div><div class="stat-box red"><strong>{{stats.rejected||0}}</strong><span>Отклонено</span></div><div class="stat-box orange"><strong>{{stats.reports||0}}</strong><span>Жалобы</span></div></div>
<div class="admin-tabs"><button :class="{active:mediaStatus==='pending'}" @click="setMediaStatus('pending')">На проверке</button><button :class="{active:mediaStatus==='approved'}" @click="setMediaStatus('approved')">Опубликованные</button><button :class="{active:mediaStatus==='rejected'}" @click="setMediaStatus('rejected')">Отклонённые</button><button :class="{active:mediaStatus==='archived'}" @click="setMediaStatus('archived')">Архив</button></div>
<div class="panel-section"><div class="panel-section-head"><div><div class="section-kicker">MODERATION</div><h3>Объявления</h3></div><span class="result-count">{{pendingAds.length}}</span></div><div v-if="pendingAds.length" class="moderation-list"><article v-for="ad in pendingAds" :key="ad.id" class="moderation-card"><div class="moderation-main"><div class="card-top"><span class="tag">{{ad.category}}</span><span class="date">{{formatDate(ad.createdAt)}}</span></div><h3>{{ad.title}}</h3><div class="moderation-price">{{money(ad.price)}}</div><p>{{displayDescription(ad.description)}}</p><div class="moderation-meta"><span>👤 {{ad.seller}}</span><span>☎ Телефон: {{ad.contact}}</span><span v-if="getVkLink(ad)">VK: {{getVkLink(ad).replace(/^https?:\/\/vk\.com\//i,"")}}</span></div></div><div class="moderation-actions"><button v-if="ad.status==='pending'" class="action-approve" @click="approve(ad)">✓ Одобрить</button><button class="action-edit" @click="openEdit(ad)">✎ Редактировать</button><button v-if="ad.status==='approved'" class="action-archive" @click="archive(ad)">↓ Снять</button><button v-if="ad.status==='pending'" class="action-reject" @click="openReject(ad)">× Отклонить</button></div></article></div><div v-else class="empty panel-empty">В этом разделе пока нет объявлений.</div></div>
<div class="panel-section"><div class="panel-section-head"><div><div class="section-kicker">REPORTS</div><h3>Жалобы пользователей</h3></div><span class="result-count">{{reports.length}}</span></div><div v-if="reports.length" class="moderation-list"><article v-for="r in reports" :key="r.id" class="report-card"><div><b>#{{r.ad_id}} · {{r.title}}</b><p>{{r.reason}}</p><small>{{r.reporter_nickname}} · {{formatDate(r.created_at)}}</small></div><div class="moderation-actions"><button class="action-approve" @click="resolveReport(r.id,'resolve')">✓ Решено</button><button class="action-reject" @click="resolveReport(r.id,'dismiss')">× Ложная</button></div></article></div><div v-else class="empty panel-empty">Новых жалоб нет.</div></div>
<div class="panel-section"><div class="panel-section-head"><div><div class="section-kicker">AUDIT LOG</div><h3>{{logScope === "all" ? "Журнал всех администраторов" : "Мои действия"}}</h3></div><span v-if='mediaRole === "root"' class="result-count">ROOT</span></div><div class="log-list"><div v-for="l in logs" :key="l.id" class="log-row"><span>#{{l.ad_id}}</span><b>{{l.action}}</b><span>{{l.moderator_nickname}}</span><small>{{formatDate(l.created_at)}}</small><em>{{l.comment}}</em></div></div></div>
</section></div>

<div v-if="editAd" class="modal-backdrop" @click.self="editAd=null"><form class="modal" @submit.prevent="saveEdit"><div class="modal-head"><div><div class="section-kicker">MODERATION</div><h2>Редактирование #{{editAd.id}}</h2></div><button type="button" class="close" @click="editAd=null">×</button></div><label>Название<input v-model="editForm.title" required maxlength="80"></label><div class="form-row"><label>Категория<select v-model="editForm.category"><option v-for="c in categories.slice(1)" :key="c">{{c}}</option></select></label><label>Город<select v-model="editForm.city"><option v-for="c in cities.slice(1)" :key="c">{{c}}</option></select></label></div><div class="form-row"><label>Цена<input v-model="editForm.price" type="number" min="0"></label><label>Контакт<input v-model="editForm.contact" maxlength="40"></label></div><label>VK <span style="font-weight: 400; color: #626772;">необязательно</span><input v-model="editForm.vk" maxlength="120" placeholder="username"></label><label>Описание<textarea v-model="editForm.description" rows="5" maxlength="500"></textarea></label><button class="btn btn-primary submit">Сохранить изменения</button></form></div>

<div v-if="rejectAdTarget" class="modal-backdrop" @click.self="rejectAdTarget=null"><form class="modal" @submit.prevent="reject"><div class="modal-head"><div><div class="section-kicker">MODERATION</div><h2>Отклонение объявления</h2></div><button type="button" class="close" @click="rejectAdTarget=null">×</button></div><p class="modal-description">{{rejectAdTarget.title}}</p><label>Причина отклонения<textarea v-model="rejectReason" required maxlength="300" rows="4" placeholder="Укажите причину..."></textarea></label><button class="btn btn-primary submit">Отклонить</button></form></div>
</div>
</template>