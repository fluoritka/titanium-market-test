const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'titanium-market.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

app.use(express.json({ limit: '1mb' }));

function nowSql() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function addDays(days) { const d = new Date(Date.now() + days * 86400000); return d.toISOString().slice(0, 19).replace('T', ' '); }
function json(res, data, status = 200) { res.status(status).json(data); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('base64')) {
  return { salt, hash: crypto.pbkdf2Sync(password, Buffer.from(salt, 'base64'), 100000, 32, 'sha256').toString('base64') };
}
function verifyPassword(password, salt, hash) {
  try {
    const actual = crypto.pbkdf2Sync(password, Buffer.from(salt, 'base64'), 100000, 32, 'sha256');
    return crypto.timingSafeEqual(actual, Buffer.from(hash, 'base64'));
  } catch { return false; }
}
function randomToken() { return crypto.randomBytes(32).toString('hex'); }
function setSessionCookie(res, token) {
  res.cookieHeader = `tm_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
  res.setHeader('Set-Cookie', res.cookieHeader);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'tm_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}
function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const item = raw.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

// Database schema.
db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'player'
);
CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  city TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(category_id) REFERENCES categories(id)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id INTEGER NOT NULL,
  reporter_nickname TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(ad_id) REFERENCES ads(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS admin_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(admin_id) REFERENCES admin_accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS moderation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id INTEGER,
  moderator_nickname TEXT NOT NULL,
  action TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const categories = ['Автомобили', 'Недвижимость', 'Работа', 'Услуги', 'Бизнесы', 'Другое'];
const insertCategory = db.prepare('INSERT OR IGNORE INTO categories(name) VALUES (?)');
for (const category of categories) insertCategory.run(category);

const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || '123456';
const existingAdmin = db.prepare('SELECT id FROM admin_accounts WHERE username=?').get(adminUsername);
if (!existingAdmin) {
  const hp = hashPassword(adminPassword);
  db.prepare('INSERT INTO admin_accounts(username,display_name,role,password_salt,password_hash,is_active) VALUES (?,?,?,?,?,1)')
    .run(adminUsername, 'Администратор Titanium Market', 'root', hp.salt, hp.hash);
}

// Create the 60 demo listings only on a fresh database.
if (db.prepare('SELECT COUNT(*) AS c FROM ads').get().c === 0) {
  const user = db.prepare('INSERT OR IGNORE INTO users(nickname,role) VALUES (?,?)').run('TestMarket', 'player');
  const userId = db.prepare('SELECT id FROM users WHERE nickname=?').get('TestMarket').id;
  const rows = [
    ['Автомобили','Продам Infernus','Лос-Сантос',12500000,'Infernus в хорошем состоянии. Без повреждений.'],
    ['Автомобили','Продам Sultan','Сан-Фиерро',3200000,'Sultan в отличном состоянии. Автомобиль полностью готов к эксплуатации.'],
    ['Автомобили','Куплю Bullet','Лас-Вентурас',9000000,'Ищу Bullet в хорошем состоянии. Рассмотрю предложения с адекватной ценой.'],
    ['Автомобили','Продам Turismo','Лос-Сантос',11000000,'Turismo, ухоженный автомобиль. Продажа владельцем.'],
    ['Автомобили','Продам Elegy','Сан-Фиерро',2800000,'Elegy в хорошем состоянии. Возможен небольшой торг.'],
    ['Автомобили','Куплю Banshee','Лос-Сантос',4500000,'Куплю Banshee в хорошем состоянии.'],
    ['Автомобили','Продам Cheetah','Лас-Вентурас',9800000,'Cheetah, аккуратное состояние. Готов показать автомобиль.'],
    ['Автомобили','Продам Buffalo','Сан-Фиерро',3600000,'Buffalo без серьёзных повреждений.'],
    ['Автомобили','Куплю Comet','Лос-Сантос',4000000,'Куплю Comet. Предлагайте автомобиль и цену.'],
    ['Автомобили','Продам Flash','Лас-Вентурас',2100000,'Flash в хорошем состоянии.'],
    ['Недвижимость','Продам дом в Лос-Сантос','Лос-Сантос',8500000,'Продаётся уютный дом в Лос-Сантос.'],
    ['Недвижимость','Продам дом у центра','Лос-Сантос',12000000,'Дом рядом с центральной частью города.'],
    ['Недвижимость','Куплю дом в Сан-Фиерро','Сан-Фиерро',10000000,'Ищу дом в Сан-Фиерро.'],
    ['Недвижимость','Продам дом в Las Colinas','Лос-Сантос',7200000,'Дом в спокойном районе.'],
    ['Недвижимость','Продам дом в Angel Pine','Лос-Сантос',6500000,'Продаётся дом в районе Angel Pine.'],
    ['Недвижимость','Куплю дом 3 класса','Сан-Фиерро',5000000,'Куплю дом 3 класса.'],
    ['Недвижимость','Сдам дом в аренду','Лас-Вентурас',250000,'Сдаётся дом на длительный срок.'],
    ['Недвижимость','Продам дом рядом с LSFM','Лос-Сантос',9300000,'Дом с удобным расположением рядом с LSFM.'],
    ['Недвижимость','Куплю дом в Лас-Вентурас','Лас-Вентурас',9000000,'Ищу дом в Лас-Вентурас.'],
    ['Недвижимость','Продам дом у шоссе','Сан-Фиерро',7800000,'Продаётся дом с удобным доступом к дорогам штата.'],
    ['Работа','Ищу работу водителем','Лос-Сантос',25000,'Ищу постоянную работу водителем.'],
    ['Работа','Ищу работу механиком','Сан-Фиерро',30000,'Ищу работу механиком.'],
    ['Работа','Требуется водитель','Лос-Сантос',35000,'В организацию требуется ответственный водитель.'],
    ['Работа','Ищу работу таксистом','Лас-Вентурас',22000,'Ищу работу таксистом.'],
    ['Работа','Требуется механик','Сан-Фиерро',40000,'Требуется механик для обслуживания транспорта.'],
    ['Работа','Ищу работу дальнобойщиком','Лос-Сантос',45000,'Ищу работу дальнобойщиком.'],
    ['Работа','Ищу работу в организации','Лас-Вентурас',30000,'Ищу работу в организации.'],
    ['Работа','Требуется сотрудник','Лос-Сантос',28000,'Ищем сотрудника на постоянную основу.'],
    ['Работа','Ищу работу курьером','Сан-Фиерро',20000,'Ищу работу курьером.'],
    ['Работа','Ищу работу охранником','Лас-Вентурас',32000,'Ищу работу охранником.'],
    ['Услуги','Услуги механика','Лос-Сантос',5000,'Ремонт и обслуживание автомобилей.'],
    ['Услуги','Услуги личного водителя','Сан-Фиерро',8000,'Предлагаю услуги личного водителя.'],
    ['Услуги','Услуги такси','Лас-Вентурас',3000,'Перевозка пассажиров по штату.'],
    ['Услуги','Услуги перевозчика','Лос-Сантос',7000,'Помогу с перевозкой транспорта и грузов.'],
    ['Услуги','Услуги автоэлектрика','Сан-Фиерро',6000,'Диагностика и устранение проблем с электрооборудованием.'],
    ['Услуги','Услуги лицензёра','Лас-Вентурас',10000,'Помощь с оформлением необходимых лицензий.'],
    ['Услуги','Услуги курьера','Лос-Сантос',2500,'Доставка небольших заказов по городу.'],
    ['Услуги','Услуги инструктора','Сан-Фиерро',9000,'Помощь новичкам с освоением транспорта.'],
    ['Услуги','Услуги водителя','Лас-Вентурас',5000,'Водительские услуги по штату.'],
    ['Услуги','Услуги эвакуатора','Лос-Сантос',4500,'Помощь с транспортировкой повреждённых автомобилей.'],
    ['Бизнесы','Продам магазин','Лос-Сантос',25000000,'Продаётся действующий магазин.'],
    ['Бизнесы','Куплю бизнес','Сан-Фиерро',30000000,'Куплю прибыльный бизнес.'],
    ['Бизнесы','Продам ресторан','Лос-Сантос',45000000,'Продаётся ресторан.'],
    ['Бизнесы','Продам кафе','Сан-Фиерро',28000000,'Готов продать действующее кафе.'],
    ['Бизнесы','Куплю магазин','Лас-Вентурас',22000000,'Ищу магазин для покупки.'],
    ['Бизнесы','Продам бизнес в центре','Лос-Сантос',55000000,'Бизнес расположен в удобном районе.'],
    ['Бизнесы','Куплю ресторан','Лас-Вентурас',40000000,'Ищу ресторан с хорошим расположением.'],
    ['Бизнесы','Продам бизнес','Сан-Фиерро',35000000,'Продаётся действующий бизнес.'],
    ['Бизнесы','Продам коммерческий объект','Лос-Сантос',60000000,'Коммерческий объект с хорошим потенциалом.'],
    ['Бизнесы','Ищу бизнес для покупки','Лас-Вентурас',50000000,'Рассмотрю покупку прибыльного бизнеса.'],
    ['Другое','Продам сим-карту','Лос-Сантос',15000,'Продам сим-карту.'],
    ['Другое','Куплю сим-карту','Сан-Фиерро',12000,'Куплю сим-карту.'],
    ['Другое','Продам стройматериалы','Лас-Вентурас',25000,'Продам комплект стройматериалов.'],
    ['Другое','Куплю материалы','Лос-Сантос',30000,'Куплю необходимые материалы.'],
    ['Другое','Продам подарок','Сан-Фиерро',8000,'Продам игровой подарок.'],
    ['Другое','Куплю подарок','Лас-Вентурас',10000,'Куплю подходящий игровой подарок.'],
    ['Другое','Продам набор предметов','Лос-Сантос',18000,'Продам набор игровых предметов.'],
    ['Другое','Куплю редкий предмет','Сан-Фиерро',25000,'Ищу редкий игровой предмет.'],
    ['Другое','Продам комплект','Лас-Вентурас',14000,'Продам комплект игровых предметов.'],
    ['Другое','Ищу игровой предмет','Лос-Сантос',20000,'Ищу определённый игровой предмет.']
  ];
  const getCategory = db.prepare('SELECT id FROM categories WHERE name=?');
  const insertAd = db.prepare(`INSERT INTO ads(user_id,title,category_id,city,price,description,contact,status,expires_at) VALUES (?,?,?,?,?,?,?,'approved',?)`);
  for (const [category,title,city,price,description] of rows) {
    const cat = getCategory.get(category).id;
    insertAd.run(userId, title, cat, city, price, description, 'TestMarket', addDays(30));
  }
}

function expireAds() {
  db.prepare("UPDATE ads SET status='expired' WHERE status='approved' AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')").run();
}
function rowToAd(row) {
  return { id:Number(row.id), title:row.title, category:row.category, city:row.city, price:Number(row.price || 0), seller:row.seller, contact:row.contact, description:row.description, status:row.status, createdAt:row.created_at, expiresAt:row.expires_at };
}
function getAds(status='approved') {
  expireAds();
  const extra = status === 'approved' ? " AND (ads.expires_at IS NULL OR datetime(ads.expires_at)>datetime('now'))" : '';
  return db.prepare(`SELECT ads.id,ads.title,categories.name AS category,ads.city,ads.price,users.nickname AS seller,ads.contact,ads.description,ads.status,ads.created_at,ads.expires_at FROM ads LEFT JOIN categories ON categories.id=ads.category_id LEFT JOIN users ON users.id=ads.user_id WHERE ads.status=?${extra} ORDER BY ads.id DESC`).all(status).map(rowToAd);
}
function getAd(id) {
  return db.prepare(`SELECT ads.id,ads.title,categories.name AS category,ads.city,ads.price,users.nickname AS seller,ads.contact,ads.description,ads.status,ads.created_at,ads.expires_at FROM ads LEFT JOIN categories ON categories.id=ads.category_id LEFT JOIN users ON users.id=ads.user_id WHERE ads.id=?`).get(id);
}
function currentAdmin(req) {
  const token = getCookie(req, 'tm_session');
  if (!token) return null;
  return db.prepare(`SELECT a.id,a.username,a.display_name,a.role,a.password_salt,a.password_hash FROM admin_sessions s JOIN admin_accounts a ON a.id=s.admin_id WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND a.is_active=1`).get(token) || null;
}
function requireAdmin(req,res,next) {
  const admin = currentAdmin(req);
  if (!admin) return json(res,{error:'Требуется авторизация.'},401);
  req.admin = admin;
  next();
}
function writeLog(adId, admin, action, comment='') {
  db.prepare('INSERT INTO moderation_logs(ad_id,moderator_nickname,action,comment) VALUES (?,?,?,?)').run(adId, admin.username, action, comment);
}

app.get('/api/health', (req,res) => json(res,{ok:true,service:'titanium-market',database:true}));
app.get('/api/ads', (req,res) => json(res,{ads:getAds('approved')}));

app.post('/api/ads', (req,res) => {
  const body = req.body || {};
  if (!body.title || !body.category || !body.seller || !body.contact) return json(res,{error:'Не заполнены обязательные поля.'},400);
  const title=String(body.title).trim().slice(0,80), category=String(body.category).trim().slice(0,40), city=String(body.city || 'Не указан').trim().slice(0,40), price=Math.max(0,Number(body.price || 0) || 0), seller=String(body.seller).trim().slice(0,32), contact=String(body.contact).trim().slice(0,40), description=String(body.description || '').trim().slice(0,500);
  const cat=db.prepare('SELECT id FROM categories WHERE name=?').get(category);
  if(!cat) return json(res,{error:'Неизвестная категория.'},400);
  let user=db.prepare('SELECT id FROM users WHERE nickname=?').get(seller);
  if(!user){ const r=db.prepare("INSERT INTO users(nickname,role) VALUES (?, 'player')").run(seller); user={id:r.lastInsertRowid}; }
  const result=db.prepare(`INSERT INTO ads(user_id,title,category_id,city,price,description,contact,status,expires_at) VALUES (?,?,?,?,?,?,?,'pending',?)`).run(user.id,title,cat.id,city,price,description,contact,addDays(7));
  json(res,{ok:true,adId:Number(result.lastInsertRowid),status:'pending'},201);
});

app.post('/api/ads/report', (req,res) => {
  const body=req.body || {}; const adId=Number(body.adId), reporter=String(body.reporter || 'Аноним').trim().slice(0,32), reason=String(body.reason || '').trim().slice(0,300);
  if(!adId || !reason) return json(res,{error:'Укажите объявление и причину.'},400);
  const ad=db.prepare("SELECT id FROM ads WHERE id=? AND status='approved'").get(adId); if(!ad) return json(res,{error:'Объявление не найдено.'},404);
  db.prepare("INSERT INTO reports(ad_id,reporter_nickname,reason,status) VALUES (?,?,?,'open')").run(adId,reporter,reason); json(res,{ok:true},201);
});

app.post('/api/media/login', (req,res) => {
  const username=String(req.body?.username || '').trim(), password=String(req.body?.password || '');
  if(!username || !password) return json(res,{error:'Введите логин и пароль.'},400);
  const admin=db.prepare('SELECT * FROM admin_accounts WHERE username=? AND is_active=1').get(username);
  if(!admin || !verifyPassword(password,admin.password_salt,admin.password_hash)) return json(res,{error:'Неверный логин или пароль.'},401);
  db.prepare("DELETE FROM admin_sessions WHERE admin_id=? OR datetime(expires_at)<=datetime('now')").run(admin.id);
  const token=randomToken(); db.prepare("INSERT INTO admin_sessions(admin_id,token,expires_at) VALUES (?,?,?)").run(admin.id,token,addDays(30));
  res.setHeader('Set-Cookie',`tm_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60*60*24*30}`);
  json(res,{ok:true,user:{nickname:admin.username,displayName:admin.display_name,role:admin.role}});
});
app.get('/api/media/me', (req,res) => { const admin=currentAdmin(req); json(res, admin ? {authenticated:true,user:{nickname:admin.username,displayName:admin.display_name,role:admin.role}} : {authenticated:false}); });
app.post('/api/media/logout',(req,res)=>{const token=getCookie(req,'tm_session');if(token)db.prepare('DELETE FROM admin_sessions WHERE token=?').run(token);clearSessionCookie(res);json(res,{ok:true});});

app.get('/api/media/stats', requireAdmin, (req,res) => {
  expireAds(); const result=db.prepare('SELECT status,COUNT(*) count FROM ads GROUP BY status').all(); const stats={pending:0,approved:0,rejected:0,archived:0,expired:0,reports:0}; for(const row of result) stats[row.status]=Number(row.count); stats.reports=Number(db.prepare("SELECT COUNT(*) count FROM reports WHERE status='open'").get().count); json(res,stats);
});
app.get('/api/media/ads', requireAdmin, (req,res) => { const status=req.query.status || 'pending'; const allowed=['pending','approved','rejected','archived','expired']; if(!allowed.includes(status)) return json(res,{error:'Недопустимый статус.'},400); json(res,{ads:getAds(status)}); });
app.get('/api/media/reports', requireAdmin, (req,res)=>{const reports=db.prepare("SELECT reports.id,reports.ad_id,reports.reporter_nickname,reports.reason,reports.status,reports.created_at,ads.title FROM reports LEFT JOIN ads ON ads.id=reports.ad_id WHERE reports.status='open' ORDER BY reports.id DESC").all();json(res,{reports});});
app.get('/api/media/logs', requireAdmin, (req,res)=>{const rows=req.admin.role==='root'?db.prepare('SELECT * FROM moderation_logs ORDER BY id DESC LIMIT 500').all():db.prepare('SELECT * FROM moderation_logs WHERE moderator_nickname=? ORDER BY id DESC LIMIT 100').all(req.admin.username);json(res,{logs:rows,scope:req.admin.role==='root'?'all':'own'});});

app.patch('/api/media/ads/:id', requireAdmin, (req,res)=>{
  const id=Number(req.params.id), ad=getAd(id); if(!ad) return json(res,{error:'Объявление не найдено.'},404); const b=req.body||{};
  const title=String(b.title ?? ad.title).trim().slice(0,80), city=String(b.city ?? ad.city).trim().slice(0,40), price=Math.max(0,Number(b.price ?? ad.price)||0), contact=String(b.contact ?? ad.contact).trim().slice(0,40), description=String(b.description ?? ad.description).trim().slice(0,500), category=String(b.category ?? ad.category).trim().slice(0,40);
  const cat=db.prepare('SELECT id FROM categories WHERE name=?').get(category); if(!cat) return json(res,{error:'Неизвестная категория.'},400);
  db.prepare('UPDATE ads SET title=?,category_id=?,city=?,price=?,description=?,contact=? WHERE id=?').run(title,cat.id,city,price,description,contact,id); writeLog(id,req.admin,'edit',`Изменено объявление #${id}.`); json(res,{ok:true});
});
app.post('/api/media/ads/:id/:action', requireAdmin, (req,res)=>{
  const id=Number(req.params.id), action=req.params.action, ad=getAd(id); if(!ad) return json(res,{error:'Объявление не найдено.'},404);
  if(!['approve','reject','archive'].includes(action)) return json(res,{error:'Неизвестное действие.'},400);
  if(action==='reject' && !String(req.body?.reason || '').trim()) return json(res,{error:'Укажите причину отклонения.'},400);
  const status=action==='approve'?'approved':action==='reject'?'rejected':'archived'; db.prepare('UPDATE ads SET status=? WHERE id=?').run(status,id); writeLog(id,req.admin,action,action==='reject'?`Причина: ${String(req.body.reason).trim().slice(0,300)}`:action==='archive'?'Объявление снято с публикации.':'Объявление одобрено.'); json(res,{ok:true,id,status});
});
app.delete('/api/media/ads/:id', requireAdmin, (req,res)=>{const id=Number(req.params.id),ad=getAd(id);if(!ad)return json(res,{error:'Объявление не найдено.'},404);db.prepare('DELETE FROM ads WHERE id=?').run(id);writeLog(null,req.admin,'delete',`Удалено объявление #${id} «${ad.title}».`);json(res,{ok:true});});
app.post('/api/media/reports/resolve', requireAdmin, (req,res)=>{const id=Number(req.body?.id),action=req.body?.action==='dismiss'?'dismissed':'resolved';if(!id)return json(res,{error:'Некорректная жалоба.'},400);const report=db.prepare('SELECT ad_id,reason FROM reports WHERE id=?').get(id);if(!report)return json(res,{error:'Жалоба не найдена.'},404);db.prepare('UPDATE reports SET status=? WHERE id=?').run(action,id);writeLog(report.ad_id,req.admin,`report_${action}`,report.reason);json(res,{ok:true});});

const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (req,res) => res.sendFile(path.join(dist,'index.html')));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Titanium Market] listening on port ${PORT}`);
  console.log(`[Titanium Market] admin login: ${adminUsername} / ${adminPassword}`);
});
