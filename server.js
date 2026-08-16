import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const DB_PATH = path.resolve(__dirname, process.env.DB_PATH || "./data/titanium-market.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(fs.readFileSync(path.join(__dirname, "db/schema.sqlite.sql"), "utf8"));
if (Number(db.prepare("SELECT COUNT(*) AS count FROM ads").get().count || 0) === 0) {
  db.exec(fs.readFileSync(path.join(__dirname, "db/seed_test_ads_clean.sql"), "utf8"));
}

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
function currentAdmin(req) {
  const token = getCookie(req, "tm_session");
  if (!token) return null;
  return db.prepare(`SELECT a.id,a.username,a.display_name,a.role,a.password_salt,a.password_hash FROM admin_sessions s JOIN admin_accounts a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at > datetime('now') AND a.is_active=1`).get(sha256(token)) || null;
}
function adminOnly(req, res) {
  const admin = currentAdmin(req);
  if (!admin) { json(res, { error: "Требуется авторизация." }, 401); return null; }
  return admin;
}
function rowToAd(row) { return { id:Number(row.id), title:row.title, category:row.category, city:row.city, price:Number(row.price||0), seller:row.seller, contact:row.contact, description:row.description, status:row.status, createdAt:row.created_at, expiresAt:row.expires_at }; }
function expireAds() { db.prepare(`UPDATE ads SET status='expired' WHERE status='approved' AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')`).run(); }
function getAds(status="pending") {
  expireAds(); let where="ads.status=?"; const params=[status];
  if(status==="approved") where += " AND (ads.expires_at IS NULL OR datetime(ads.expires_at)>datetime('now'))";
  return db.prepare(`SELECT ads.id,ads.title,categories.name AS category,ads.city,ads.price,users.nickname AS seller,ads.contact,ads.description,ads.status,ads.created_at,ads.expires_at FROM ads LEFT JOIN categories ON categories.id=ads.category_id LEFT JOIN users ON users.id=ads.user_id WHERE ${where} ORDER BY ads.id DESC`).all(...params).map(rowToAd);
}
function getAd(id) { return db.prepare(`SELECT ads.id,ads.title,categories.name AS category,ads.city,ads.price,users.nickname AS seller,ads.contact,ads.description,ads.status,ads.created_at,ads.expires_at FROM ads LEFT JOIN categories ON categories.id=ads.category_id LEFT JOIN users ON users.id=ads.user_id WHERE ads.id=?`).get(id); }
function writeLog(adId, admin, action, comment) { db.prepare("INSERT INTO moderation_logs (ad_id,moderator_nickname,action,comment) VALUES (?,?,?,?)").run(adId,admin.username,action,comment); }

app.get("/api/health", (_req,res)=>json(res,{ok:true,service:"titanium-market",database:true}));
app.get("/api/ads", (_req,res)=>json(res,{ads:getAds("approved")}));
app.post("/api/ads", (req,res)=>{
  const body=req.body||{}; if(!body.title||!body.category||!body.seller||!body.contact) return json(res,{error:"Не заполнены обязательные поля."},400);
  const title=String(body.title).trim().slice(0,80), category=String(body.category).trim().slice(0,40), city=String(body.city??"Не указан").trim().slice(0,40), price=Math.max(0,Number(body.price??0)||0), seller=String(body.seller).trim().slice(0,32), contact=String(body.contact).trim().slice(0,40), description=String(body.description??"").trim().slice(0,500);
  const categoryRow=db.prepare("SELECT id FROM categories WHERE name=?").get(category); if(!categoryRow) return json(res,{error:"Неизвестная категория."},400);
  let user=db.prepare("SELECT id FROM users WHERE nickname=?").get(seller); if(!user){db.prepare("INSERT INTO users (nickname,role) VALUES (?,'player')").run(seller); user=db.prepare("SELECT id FROM users WHERE nickname=?").get(seller);}
  if(!user) return json(res,{error:"Не удалось создать пользователя."},500);
  const result=db.prepare(`INSERT INTO ads (user_id,title,category_id,city,price,description,contact,status,expires_at) VALUES (?,?,?,?,?,?,?,'pending',datetime('now','+7 days'))`).run(user.id,title,categoryRow.id,city,price,description,contact);
  json(res,{ok:true,adId:Number(result.lastInsertRowid),status:"pending"},201);
});
app.post("/api/ads/report",(req,res)=>{
  const body=req.body||{}, adId=Number(body.adId), reporter=String(body.reporter??"Аноним").trim().slice(0,32), reason=String(body.reason??"").trim().slice(0,300);
  if(!adId||!reason) return json(res,{error:"Укажите объявление и причину."},400);
  if(!db.prepare("SELECT id FROM ads WHERE id=? AND status='approved'").get(adId)) return json(res,{error:"Объявление не найдено."},404);
  db.prepare("INSERT INTO reports (ad_id,reporter_nickname,reason,status) VALUES (?,?,?,'open')").run(adId,reporter,reason); json(res,{ok:true},201);
});
app.post("/api/media/login",(req,res)=>{
  const body=req.body||{}, username=String(body.username??"").trim(), password=String(body.password??""); if(!username||!password)return json(res,{error:"Введите логин и пароль."},400);
  const admin=db.prepare("SELECT * FROM admin_accounts WHERE username=? AND is_active=1").get(username); if(!admin||!verifyPassword(password,admin.password_salt,admin.password_hash))return json(res,{error:"Неверный логин или пароль."},401);
  const token=crypto.randomBytes(32).toString("base64"); db.prepare("DELETE FROM admin_sessions WHERE admin_id=? OR expires_at<=datetime('now')").run(admin.id); db.prepare("INSERT INTO admin_sessions (admin_id,token_hash,expires_at) VALUES (?,?,datetime('now','+30 days'))").run(admin.id,sha256(token));
  res.set("Set-Cookie",cookie("tm_session",token,req,60*60*24*30)); json(res,{ok:true,user:{nickname:admin.username,displayName:admin.display_name,role:admin.role}});
});
app.get("/api/media/me",(req,res)=>{const admin=currentAdmin(req); if(!admin)return json(res,{authenticated:false}); json(res,{authenticated:true,user:{nickname:admin.username,displayName:admin.display_name,role:admin.role}});});
app.post("/api/media/logout",(req,res)=>{const token=getCookie(req,"tm_session");if(token)db.prepare("DELETE FROM admin_sessions WHERE token_hash=?").run(sha256(token));res.set("Set-Cookie",clearCookie("tm_session",req));json(res,{ok:true});});
app.get("/api/media/stats",(req,res)=>{const admin=adminOnly(req,res);if(!admin)return;expireAds();const rows=db.prepare("SELECT status,COUNT(*) AS count FROM ads GROUP BY status").all();const reports=db.prepare("SELECT COUNT(*) AS count FROM reports WHERE status='open'").get();const stats={pending:0,approved:0,rejected:0,archived:0,expired:0,reports:Number(reports?.count??0)};for(const row of rows)stats[row.status]=Number(row.count);json(res,stats);});
app.get("/api/media/ads",(req,res)=>{const admin=adminOnly(req,res);if(!admin)return;const status=String(req.query.status||"pending"),allowed=["pending","approved","rejected","archived","expired"];if(!allowed.includes(status))return json(res,{error:"Недопустимый статус."},400);json(res,{ads:getAds(status)});});
app.get("/api/media/reports",(req,res)=>{const admin=adminOnly(req,res);if(!admin)return;const reports=db.prepare(`SELECT reports.id,reports.ad_id,reports.reporter_nickname,reports.reason,reports.status,reports.created_at,ads.title FROM reports LEFT JOIN ads ON ads.id=reports.ad_id WHERE reports.status='open' ORDER BY reports.id DESC`).all();json(res,{reports});});
app.get("/api/media/logs",(req,res)=>{const admin=adminOnly(req,res);if(!admin)return;if(admin.role==='root'){const logs=db.prepare("SELECT id,ad_id,moderator_nickname,action,comment,created_at FROM moderation_logs ORDER BY id DESC LIMIT 500").all();return json(res,{logs,scope:"all"});}const logs=db.prepare("SELECT id,ad_id,moderator_nickname,action,comment,created_at FROM moderation_logs WHERE moderator_nickname=? ORDER BY id DESC LIMIT 100").all(admin.username);json(res,{logs,scope:"own"});});
app.patch("/api/media/ads/:id",(req,res)=>{const admin=adminOnly(req,res);if(!admin)return;const id=Number(req.params.id),body=req.body||{},ad=getAd(id);if(!ad)return json(res,{error:"Объявление не найдено."},404);const title=String(body.title??ad.title).trim().slice(0,80),city=String(body.city??ad.city).trim().slice(0,40),price=Math.max(0,Number(body.price??ad.price)||0),contact=String(body.contact??ad.contact).trim().slice(0,40),description=String(body.description??ad.description).trim().slice(0,500),category=String(body.category??ad.category).trim().slice(0,40),cat=db.prepare("SELECT id FROM categories WHERE name=?").get(category);if(!cat)return json(res,{error:"Неизвестная категория."},400);const comment=`Изменено объявление #${id}: название «${ad.title}» → «${title}»; цена ${ad.price} → ${price}; город «${ad.city}» → «${city}»; категория «${ad.category}» → «${category}»; контакт «${ad.contact}» → «${contact}».`;db.prepare("UPDATE ads SET title=?,category_id=?,city=?,price=?,description=?,contact=? WHERE id=?").run(title,cat.id,city,price,description,contact,id);writeLog(id,admin,"edit",comment);json(res,{ok:true});});
app.post("/api/media/ads/:id/:action",(req,res)=>{const admin=adminOnly(req,res);if(!admin)return;const id=Number(req.params.id),action=req.params.action,ad=getAd(id);if(!["approve","reject","archive"].includes(action))return json(res,{error:"Недопустимое действие."},400);if(!ad)return json(res,{error:"Объявление не найдено."},404);const body=req.body||{},status=action==='approve'?'approved':action==='reject'?'rejected':'archived';if(action==='reject'&&!String(body.reason??"").trim())return json(res,{error:"Укажите причину отклонения."},400);db.prepare("UPDATE ads SET status=? WHERE id=?").run(status,id);const comment=action==='reject'?`Причина: ${String(body.reason).trim().slice(0,300)}`:action==='archive'?"Объявление снято с публикации.":"Объявление одобрено.";writeLog(id,admin,action,comment);json(res,{ok:true,id,status});});
app.delete("/api/media/ads/:id",(req,res)=>{const admin=adminOnly(req,res);if(!admin)return;const id=Number(req.params.id),ad=getAd(id);if(!ad)return json(res,{error:"Объявление не найдено."},404);db.exec("BEGIN");try{db.prepare("DELETE FROM reports WHERE ad_id=?").run(id);db.prepare("DELETE FROM moderation_logs WHERE ad_id=?").run(id);db.prepare("DELETE FROM ads WHERE id=?").run(id);db.prepare("INSERT INTO moderation_logs (ad_id,moderator_nickname,action,comment) VALUES (NULL,?,?,?)").run(admin.username,"delete",`Удалено объявление #${id} «${ad.title}».`);db.exec("COMMIT");}catch(e){db.exec("ROLLBACK");throw e;}json(res,{ok:true});});
app.post("/api/media/reports/resolve",(req,res)=>{const admin=adminOnly(req,res);if(!admin)return;const body=req.body||{},id=Number(body.id),action=body.action==='dismiss'?'dismissed':'resolved';if(!id)return json(res,{error:"Некорректная жалоба."},400);const report=db.prepare("SELECT ad_id,reason FROM reports WHERE id=?").get(id);if(!report)return json(res,{error:"Жалоба не найдена."},404);db.prepare("UPDATE reports SET status=? WHERE id=?").run(action,id);writeLog(report.ad_id,admin,`report_${action}`,report.reason);json(res,{ok:true});});

const dist=path.join(__dirname,"dist");
app.use(express.static(dist,{index:false}));
app.get(/.*/,(_req,res)=>res.sendFile(path.join(dist,"index.html")));
app.listen(PORT,"0.0.0.0",()=>console.log(`[Titanium Market] listening on port ${PORT}`));
