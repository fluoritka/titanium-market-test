import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);

if (!process.env.DATABASE_URL) {
  console.error("[Titanium Market] DATABASE_URL is not configured.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

function json(res, data, status = 200, extraHeaders = {}) {
  res.status(status).set({ "cache-control": "no-store", ...extraHeaders }).json(data);
}
function cookie(name, value, req, maxAge) {
  const secure = req.secure ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function clearCookie(name, req) {
  const secure = req.secure ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
function getCookie(req, name) {
  const header = req.headers.cookie || "";
  const item = header.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}
function sha256(value) { return crypto.createHash("sha256").update(value).digest("base64"); }
function verifyPassword(password, saltB64, hashB64) {
  const actual = crypto.pbkdf2Sync(password, Buffer.from(saltB64, "base64"), 100000, 32, "sha256");
  const expected = Buffer.from(hashB64, "base64");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function rowToAd(row) {
  return { id:Number(row.id), title:row.title, category:row.category, city:row.city, price:Number(row.price||0), seller:row.seller, contact:row.contact, description:row.description, status:row.status, createdAt:row.created_at, expiresAt:row.expires_at };
}
async function expireAds() {
  await pool.query(`UPDATE ads SET status='expired' WHERE status='approved' AND expires_at IS NOT NULL AND expires_at <= NOW()`);
}
async function getAds(status="pending") {
  await expireAds();
  let where="ads.status=$1";
  const params=[status];
  if(status==="approved") where += " AND (ads.expires_at IS NULL OR ads.expires_at>NOW())";
  const result=await pool.query(`SELECT ads.id,ads.title,categories.name AS category,ads.city,ads.price,users.nickname AS seller,ads.contact,ads.description,ads.status,ads.created_at,ads.expires_at FROM ads LEFT JOIN categories ON categories.id=ads.category_id LEFT JOIN users ON users.id=ads.user_id WHERE ${where} ORDER BY ads.id DESC`,params);
  return result.rows.map(rowToAd);
}
async function getAd(id) {
  const result=await pool.query(`SELECT ads.id,ads.title,categories.name AS category,ads.city,ads.price,users.nickname AS seller,ads.contact,ads.description,ads.status,ads.created_at,ads.expires_at FROM ads LEFT JOIN categories ON categories.id=ads.category_id LEFT JOIN users ON users.id=ads.user_id WHERE ads.id=$1`,[id]);
  return result.rows[0] || null;
}
async function writeLog(adId,admin,action,comment) {
  await pool.query("INSERT INTO moderation_logs (ad_id,moderator_nickname,action,comment) VALUES ($1,$2,$3,$4)",[adId,admin.username,action,comment]);
}
async function currentAdmin(req) {
  const token=getCookie(req,"tm_session");
  if(!token) return null;
  const result=await pool.query(`SELECT a.id,a.username,a.display_name,a.role,a.password_salt,a.password_hash FROM admin_sessions s JOIN admin_accounts a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND a.is_active=1 LIMIT 1`,[sha256(token)]);
  return result.rows[0] || null;
}
async function adminOnly(req,res) {
  try {
    const admin=await currentAdmin(req);
    if(!admin){json(res,{error:"Требуется авторизация."},401);return null;}
    return admin;
  } catch(error) {
    console.error("[Titanium Market] admin auth error:",error);
    json(res,{error:"Ошибка проверки авторизации."},500);
    return null;
  }
}

app.get("/api/health",async(_req,res)=>{
  try { await pool.query("SELECT 1"); json(res,{ok:true,service:"titanium-market",database:true,databaseType:"postgresql"}); }
  catch(error){ console.error("[Titanium Market] health check error:",error); json(res,{ok:false,service:"titanium-market",database:false,databaseType:"postgresql"},503); }
});

app.get("/api/ads",async(_req,res)=>{
  try { json(res,{ads:await getAds("approved")}); }
  catch(error){ console.error("[Titanium Market] GET /api/ads:",error); json(res,{error:"Не удалось загрузить объявления."},500); }
});

app.post("/api/ads",async(req,res)=>{
  try {
    const body=req.body||{};
    if(!body.title||!body.category||!body.seller||!body.contact) return json(res,{error:"Не заполнены обязательные поля."},400);
    const title=String(body.title).trim().slice(0,80), category=String(body.category).trim().slice(0,40), city=String(body.city??"Не указан").trim().slice(0,40), price=Math.max(0,Number(body.price??0)||0), seller=String(body.seller).trim().slice(0,32), contact=String(body.contact).trim().slice(0,40), description=String(body.description??"").trim().slice(0,500);
    const categoryResult=await pool.query("SELECT id FROM categories WHERE name=$1",[category]);
    const categoryRow=categoryResult.rows[0];
    if(!categoryRow) return json(res,{error:"Неизвестная категория."},400);
    let userResult=await pool.query("SELECT id FROM users WHERE nickname=$1",[seller]);
    let user=userResult.rows[0];
    if(!user){
      userResult=await pool.query(`INSERT INTO users (nickname,role) VALUES ($1,'player') ON CONFLICT (nickname) DO UPDATE SET nickname=EXCLUDED.nickname RETURNING id`,[seller]);
      user=userResult.rows[0];
    }
    if(!user) return json(res,{error:"Не удалось создать пользователя."},500);
    const result=await pool.query(`INSERT INTO ads (user_id,title,category_id,city,price,description,contact,status,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',NOW()+INTERVAL '7 days') RETURNING id`,[user.id,title,categoryRow.id,city,price,description,contact]);
    return json(res,{ok:true,adId:Number(result.rows[0].id),status:"pending"},201);
  } catch(error){ console.error("[Titanium Market] POST /api/ads:",error); return json(res,{error:"Не удалось создать объявление."},500); }
});

app.post("/api/ads/report",async(req,res)=>{
  try {
    const body=req.body||{},adId=Number(body.adId),reporter=String(body.reporter??"Аноним").trim().slice(0,32),reason=String(body.reason??"").trim().slice(0,300);
    if(!adId||!reason) return json(res,{error:"Укажите объявление и причину."},400);
    const adResult=await pool.query("SELECT id FROM ads WHERE id=$1 AND status='approved'",[adId]);
    if(!adResult.rows[0]) return json(res,{error:"Объявление не найдено."},404);
    await pool.query("INSERT INTO reports (ad_id,reporter_nickname,reason,status) VALUES ($1,$2,$3,'open')",[adId,reporter,reason]);
    return json(res,{ok:true},201);
  } catch(error){ console.error("[Titanium Market] POST /api/ads/report:",error); return json(res,{error:"Не удалось отправить жалобу."},500); }
});

app.post("/api/media/login",async(req,res)=>{
  try {
    const body=req.body||{},username=String(body.username??"").trim(),password=String(body.password??"");
    if(!username||!password) return json(res,{error:"Введите логин и пароль."},400);
    const result=await pool.query("SELECT * FROM admin_accounts WHERE username=$1 AND is_active=1 LIMIT 1",[username]);
    const admin=result.rows[0];
    if(!admin||!verifyPassword(password,admin.password_salt,admin.password_hash)) return json(res,{error:"Неверный логин или пароль."},401);
    const token=crypto.randomBytes(32).toString("base64"),tokenHash=sha256(token);
    await pool.query("DELETE FROM admin_sessions WHERE admin_id=$1 OR expires_at<=NOW()",[admin.id]);
    await pool.query("INSERT INTO admin_sessions (admin_id,token_hash,expires_at) VALUES ($1,$2,NOW()+INTERVAL '30 days')",[admin.id,tokenHash]);
    res.set("Set-Cookie",cookie("tm_session",token,req,60*60*24*30));
    return json(res,{ok:true,user:{nickname:admin.username,displayName:admin.display_name,role:admin.role}});
  } catch(error){ console.error("[Titanium Market] POST /api/media/login:",error); return json(res,{error:"Ошибка входа."},500); }
});

app.get("/api/media/me",async(req,res)=>{
  try { const admin=await currentAdmin(req); if(!admin)return json(res,{authenticated:false}); return json(res,{authenticated:true,user:{nickname:admin.username,displayName:admin.display_name,role:admin.role}}); }
  catch(error){ console.error("[Titanium Market] GET /api/media/me:",error); return json(res,{error:"Ошибка проверки авторизации."},500); }
});

app.post("/api/media/logout",async(req,res)=>{
  try { const token=getCookie(req,"tm_session"); if(token) await pool.query("DELETE FROM admin_sessions WHERE token_hash=$1",[sha256(token)]); res.set("Set-Cookie",clearCookie("tm_session",req)); return json(res,{ok:true}); }
  catch(error){ console.error("[Titanium Market] POST /api/media/logout:",error); return json(res,{error:"Ошибка выхода."},500); }
});

app.get("/api/media/stats",async(req,res)=>{
  try {
    const admin=await adminOnly(req,res); if(!admin)return;
    await expireAds();
    const rowsResult=await pool.query("SELECT status,COUNT(*)::int AS count FROM ads GROUP BY status");
    const reportsResult=await pool.query("SELECT COUNT(*)::int AS count FROM reports WHERE status='open'");
    const stats={pending:0,approved:0,rejected:0,archived:0,expired:0,reports:Number(reportsResult.rows[0]?.count??0)};
    for(const row of rowsResult.rows) stats[row.status]=Number(row.count);
    return json(res,stats);
  } catch(error){ console.error("[Titanium Market] GET /api/media/stats:",error); return json(res,{error:"Не удалось загрузить статистику."},500); }
});

app.get("/api/media/ads",async(req,res)=>{
  try {
    const admin=await adminOnly(req,res); if(!admin)return;
    const status=String(req.query.status||"pending"),allowed=["pending","approved","rejected","archived","expired"];
    if(!allowed.includes(status)) return json(res,{error:"Недопустимый статус."},400);
    return json(res,{ads:await getAds(status)});
  } catch(error){ console.error("[Titanium Market] GET /api/media/ads:",error); return json(res,{error:"Не удалось загрузить объявления."},500); }
});

app.get("/api/media/reports",async(req,res)=>{
  try {
    const admin=await adminOnly(req,res); if(!admin)return;
    const result=await pool.query(`SELECT reports.id,reports.ad_id,reports.reporter_nickname,reports.reason,reports.status,reports.created_at,ads.title FROM reports LEFT JOIN ads ON ads.id=reports.ad_id WHERE reports.status='open' ORDER BY reports.id DESC`);
    return json(res,{reports:result.rows});
  } catch(error){ console.error("[Titanium Market] GET /api/media/reports:",error); return json(res,{error:"Не удалось загрузить жалобы."},500); }
});

app.get("/api/media/logs",async(req,res)=>{
  try {
    const admin=await adminOnly(req,res); if(!admin)return;
    if(admin.role==='root'){
      const result=await pool.query("SELECT id,ad_id,moderator_nickname,action,comment,created_at FROM moderation_logs ORDER BY id DESC LIMIT 500");
      return json(res,{logs:result.rows,scope:"all"});
    }
    const result=await pool.query("SELECT id,ad_id,moderator_nickname,action,comment,created_at FROM moderation_logs WHERE moderator_nickname=$1 ORDER BY id DESC LIMIT 100",[admin.username]);
    return json(res,{logs:result.rows,scope:"own"});
  } catch(error){ console.error("[Titanium Market] GET /api/media/logs:",error); return json(res,{error:"Не удалось загрузить логи."},500); }
});

app.patch("/api/media/ads/:id",async(req,res)=>{
  try {
    const admin=await adminOnly(req,res); if(!admin)return;
    const id=Number(req.params.id),body=req.body||{},ad=await getAd(id);
    if(!ad)return json(res,{error:"Объявление не найдено."},404);
    const title=String(body.title??ad.title).trim().slice(0,80),city=String(body.city??ad.city).trim().slice(0,40),price=Math.max(0,Number(body.price??ad.price)||0),contact=String(body.contact??ad.contact).trim().slice(0,40),description=String(body.description??ad.description).trim().slice(0,500),category=String(body.category??ad.category).trim().slice(0,40);
    const categoryResult=await pool.query("SELECT id FROM categories WHERE name=$1",[category]),cat=categoryResult.rows[0];
    if(!cat)return json(res,{error:"Неизвестная категория."},400);
    const comment=`Изменено объявление #${id}: название «${ad.title}» → «${title}»; цена ${ad.price} → ${price}; город «${ad.city}» → «${city}»; категория «${ad.category}» → «${category}»; контакт «${ad.contact}» → «${contact}».`;
    await pool.query("UPDATE ads SET title=$1,category_id=$2,city=$3,price=$4,description=$5,contact=$6 WHERE id=$7",[title,cat.id,city,price,description,contact,id]);
    await writeLog(id,admin,"edit",comment);
    return json(res,{ok:true});
  } catch(error){ console.error("[Titanium Market] PATCH /api/media/ads/:id:",error); return json(res,{error:"Не удалось изменить объявление."},500); }
});

app.post("/api/media/ads/:id/:action",async(req,res)=>{
  try {
    const admin=await adminOnly(req,res); if(!admin)return;
    const id=Number(req.params.id),action=req.params.action,ad=await getAd(id);
    if(!["approve","reject","archive"].includes(action))return json(res,{error:"Недопустимое действие."},400);
    if(!ad)return json(res,{error:"Объявление не найдено."},404);
    const body=req.body||{},status=action==='approve'?'approved':action==='reject'?'rejected':'archived';
    if(action==='reject'&&!String(body.reason??"").trim())return json(res,{error:"Укажите причину отклонения."},400);
    await pool.query("UPDATE ads SET status=$1 WHERE id=$2",[status,id]);
    const comment=action==='reject'?`Причина: ${String(body.reason).trim().slice(0,300)}`:action==='archive'?"Объявление снято с публикации.":"Объявление одобрено.";
    await writeLog(id,admin,action,comment);
    return json(res,{ok:true,id,status});
  } catch(error){ console.error("[Titanium Market] POST /api/media/ads/:id/:action:",error); return json(res,{error:"Не удалось изменить статус объявления."},500); }
});

app.delete("/api/media/ads/:id",async(req,res)=>{
  const admin=await adminOnly(req,res); if(!admin)return;
  const client=await pool.connect();
  try {
    const id=Number(req.params.id);
    const adResult=await client.query("SELECT id,title FROM ads WHERE id=$1",[id]);
    const ad=adResult.rows[0];
    if(!ad)return json(res,{error:"Объявление не найдено."},404);
    await client.query("BEGIN");
    await client.query("DELETE FROM reports WHERE ad_id=$1",[id]);
    await client.query("DELETE FROM moderation_logs WHERE ad_id=$1",[id]);
    await client.query("DELETE FROM ads WHERE id=$1",[id]);
    await client.query("INSERT INTO moderation_logs (ad_id,moderator_nickname,action,comment) VALUES (NULL,$1,$2,$3)",[admin.username,"delete",`Удалено объявление #${id} «${ad.title}».`]);
    await client.query("COMMIT");
    return json(res,{ok:true});
  } catch(error){
    await client.query("ROLLBACK");
    console.error("[Titanium Market] DELETE /api/media/ads/:id:",error);
    return json(res,{error:"Не удалось удалить объявление."},500);
  } finally { client.release(); }
});

app.post("/api/media/reports/resolve",async(req,res)=>{
  try {
    const admin=await adminOnly(req,res); if(!admin)return;
    const body=req.body||{},id=Number(body.id),action=body.action==='dismiss'?'dismissed':'resolved';
    if(!id)return json(res,{error:"Некорректная жалоба."},400);
    const reportResult=await pool.query("SELECT ad_id,reason FROM reports WHERE id=$1",[id]),report=reportResult.rows[0];
    if(!report)return json(res,{error:"Жалоба не найдена."},404);
    await pool.query("UPDATE reports SET status=$1 WHERE id=$2",[action,id]);
    await writeLog(report.ad_id,admin,`report_${action}`,report.reason);
    return json(res,{ok:true});
  } catch(error){ console.error("[Titanium Market] POST /api/media/reports/resolve:",error); return json(res,{error:"Не удалось обработать жалобу."},500); }
});

const dist=path.join(__dirname,"dist");
app.use(express.static(dist,{index:false}));
app.get(/.*/,(_req,res)=>res.sendFile(path.join(dist,"index.html")));

const server=app.listen(PORT,"0.0.0.0",()=>{
  console.log(`[Titanium Market] listening on port ${PORT}`);
  console.log("[Titanium Market] database: Supabase PostgreSQL");
});

async function shutdown(signal){
  console.log(`[Titanium Market] ${signal} received, shutting down...`);
  server.close(async()=>{ try { await pool.end(); } finally { process.exit(0); } });
}
process.on("SIGTERM",()=>shutdown("SIGTERM"));
process.on("SIGINT",()=>shutdown("SIGINT"));
