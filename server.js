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

// VK хранится в отдельном поле объявления. Создаём его автоматически
// для существующей базы, не затрагивая остальные поля.
await pool.query("ALTER TABLE ads ADD COLUMN IF NOT EXISTS vk TEXT");

// Категория «Сим-Карты» нужна текущему интерфейсу подачи объявлений.
// Добавляем её автоматически при запуске, если её ещё нет в БД.
await pool.query(`
  INSERT INTO categories (name)
  SELECT $1
  WHERE NOT EXISTS (
    SELECT 1 FROM categories WHERE name=$1
  )
`, ["Сим-Карты"]);

// User accounts/session storage for the personal cabinet. Existing users remain valid:
// password fields are nullable so previously created nickname-only users can claim
// their existing listings by registering with the same nickname.
await pool.query(`
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_salt TEXT,
    ADD COLUMN IF NOT EXISTS password_hash TEXT
`);
await pool.query(`
  ALTER TABLE ads
    ADD COLUMN IF NOT EXISTS last_extended_at TIMESTAMPTZ
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_ads_user_id ON ads(user_id)`);

function normalizeVk(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const v = raw
    .replace(/^https?:\/\/(?:www\.)?vk\.com\//i, "")
    .replace(/^vk\.com\//i, "")
    .replace(/^@/, "")
    .replace(/^\//, "")
    .trim();
  if (!v || /[\s\]]/.test(v)) return "";
  return `https://vk.com/${v}`.slice(0, 200);
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
function rowToAd(row) {
  return {
    id:Number(row.id),
    title:row.title,
    category:row.category,
    city:row.city,
    price:Number(row.price||0),
    seller:row.seller,
    contact:row.contact,
    description:row.description,
    vk:row.vk,
    status:row.status,
    createdAt:row.created_at,
    expiresAt:row.expires_at
  };
}
async function expireAds() {
  try {
    const result = await pool.query(`
      UPDATE ads
      SET status = 'expired'
      WHERE status = 'approved'
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
      RETURNING id, title
    `);

    for (const ad of result.rows) {
      console.log(
        `[Titanium Market] Объявление #${ad.id} "${ad.title}" перемещено в expired после 7 дней публикации.`
      );
    }
  } catch (error) {
    console.error(
      "[Titanium Market] Ошибка обработки истёкших объявлений:",
      error
    );
  }
}
async function getAds(status="pending") {
  await expireAds();
  let where="ads.status=$1";
  const params=[status];
  if(status==="approved") where += " AND (ads.expires_at IS NULL OR ads.expires_at>NOW())";
  const result=await pool.query(`SELECT ads.id,ads.title,categories.name AS category,ads.city,ads.price,users.nickname AS seller,ads.contact,ads.description,ads.vk,ads.status,ads.created_at,ads.expires_at FROM ads LEFT JOIN categories ON categories.id=ads.category_id LEFT JOIN users ON users.id=ads.user_id WHERE ${where} ORDER BY ads.id DESC`,params);
  return result.rows.map(rowToAd);
}
async function getAd(id) {
  const result=await pool.query(`SELECT ads.id,ads.title,categories.name AS category,ads.city,ads.price,users.nickname AS seller,ads.contact,ads.description,ads.vk,ads.status,ads.created_at,ads.expires_at FROM ads LEFT JOIN categories ON categories.id=ads.category_id LEFT JOIN users ON users.id=ads.user_id WHERE ads.id=$1`,[id]);
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

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");
  return {
    salt: salt.toString("base64"),
    hash: hash.toString("base64")
  };
}

async function currentUser(req) {
  const token=getCookie(req,"tm_user_session");
  if(!token) return null;
  const result=await pool.query(
    `SELECT u.id,u.nickname,u.role
     FROM user_sessions s
     JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>NOW()
     LIMIT 1`,
    [sha256(token)]
  );
  return result.rows[0] || null;
}

async function userOnly(req,res) {
  try {
    const user=await currentUser(req);
    if(!user){
      json(res,{error:"Требуется авторизация."},401);
      return null;
    }
    return user;
  } catch(error) {
    console.error("[Titanium Market] user auth error:",error);
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
    const category=String(body.category??"").trim().slice(0,40);
    const isSimCard=category==="Сим-Карты";

    // Для SIM-карт обязательны только название/номер, цена, игровой ник.
    // VK и описание остаются необязательными, а контакт не используется.
    if(!body.title||!category||!body.seller){
      return json(res,{error:"Не заполнены обязательные поля."},400);
    }

    if(!body.contact){
      return json(res,{error:"Укажите номер телефона."},400);
    }

    const title=String(body.title).trim().slice(0,80);
    const city=isSimCard
      ? "Не указан"
      : String(body.city??"Не указан").trim().slice(0,40);
    const price=Math.max(0,Number(body.price??0)||0);
    const authenticatedUser=await currentUser(req);
    const seller=authenticatedUser
      ? authenticatedUser.nickname
      : String(body.seller).trim().slice(0,32);
    const contact=String(body.contact??"").trim().slice(0,40);
    const description=String(body.description??"").trim().slice(0,500);
    const vk=normalizeVk(body.vk);

    const categoryResult=await pool.query(
      "SELECT id FROM categories WHERE name=$1",
      [category]
    );
    const categoryRow=categoryResult.rows[0];

    if(!categoryRow){
      return json(res,{error:"Неизвестная категория."},400);
    }

    let user=authenticatedUser ? { id:authenticatedUser.id } : null;
    if(!user){
      let userResult=await pool.query(
        "SELECT id FROM users WHERE nickname=$1",
        [seller]
      );
      user=userResult.rows[0];

      if(!user){
        userResult=await pool.query(
          `INSERT INTO users (nickname,role)
           VALUES ($1,'player')
           ON CONFLICT (nickname) DO UPDATE SET nickname=EXCLUDED.nickname
           RETURNING id`,
          [seller]
        );
        user=userResult.rows[0];
      }
    }

    if(!user){
      return json(res,{error:"Не удалось создать пользователя."},500);
    }

    const result=await pool.query(
      `INSERT INTO ads
       (user_id,title,category_id,city,price,description,contact,vk,status,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',NOW()+INTERVAL '7 days')
       RETURNING id`,
      [user.id,title,categoryRow.id,city,price,description,contact,vk]
    );

    return json(
      res,
      {ok:true,adId:Number(result.rows[0].id),status:"pending"},
      201
    );
  } catch(error){
    console.error("[Titanium Market] POST /api/ads:",error);
    return json(res,{error:"Не удалось создать объявление."},500);
  }
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

app.post("/api/user/register",async(req,res)=>{
  try {
    const body=req.body||{};
    const nickname=String(body.nickname??"").trim().slice(0,32);
    const password=String(body.password??"");
    const passwordRepeat=String(body.passwordRepeat??"");

    if(!/^[A-Za-zА-Яа-яЁё0-9_\-]{3,32}$/.test(nickname)){
      return json(res,{error:"Игровой ник должен содержать от 3 до 32 символов: буквы, цифры, _ или -."},400);
    }
    if(password.length<6){
      return json(res,{error:"Пароль должен содержать минимум 6 символов."},400);
    }
    if(password!==passwordRepeat){
      return json(res,{error:"Пароли не совпадают."},400);
    }

    const existingResult=await pool.query(
      "SELECT id,nickname,password_hash FROM users WHERE nickname=$1 LIMIT 1",
      [nickname]
    );
    const existing=existingResult.rows[0];
    const credentials=hashPassword(password);

    let user;
    if(existing){
      if(existing.password_hash){
        return json(res,{error:"Пользователь с таким игровым ником уже зарегистрирован."},409);
      }
      const result=await pool.query(
        "UPDATE users SET password_salt=$1,password_hash=$2 WHERE id=$3 RETURNING id,nickname,role",
        [credentials.salt,credentials.hash,existing.id]
      );
      user=result.rows[0];
    } else {
      const result=await pool.query(
        `INSERT INTO users (nickname,role,password_salt,password_hash)
         VALUES ($1,'player',$2,$3)
         RETURNING id,nickname,role`,
        [nickname,credentials.salt,credentials.hash]
      );
      user=result.rows[0];
    }

    const token=crypto.randomBytes(32).toString("base64");
    await pool.query("DELETE FROM user_sessions WHERE user_id=$1 OR expires_at<=NOW()",[user.id]);
    await pool.query(
      "INSERT INTO user_sessions (user_id,token_hash,expires_at) VALUES ($1,$2,NOW()+INTERVAL '30 days')",
      [user.id,sha256(token)]
    );
    res.set("Set-Cookie",cookie("tm_user_session",token,req,60*60*24*30));
    return json(res,{ok:true,user:{nickname:user.nickname,role:user.role}},201);
  } catch(error){
    console.error("[Titanium Market] POST /api/user/register:",error);
    return json(res,{error:"Не удалось зарегистрировать пользователя."},500);
  }
});

app.post("/api/user/login",async(req,res)=>{
  try {
    const body=req.body||{};
    const nickname=String(body.nickname??"").trim();
    const password=String(body.password??"");
    if(!nickname||!password) return json(res,{error:"Введите игровой ник и пароль."},400);

    const result=await pool.query(
      "SELECT id,nickname,role,password_salt,password_hash FROM users WHERE nickname=$1 LIMIT 1",
      [nickname]
    );
    const user=result.rows[0];
    if(!user||!user.password_hash||!verifyPassword(password,user.password_salt,user.password_hash)){
      return json(res,{error:"Неверный игровой ник или пароль."},401);
    }

    const token=crypto.randomBytes(32).toString("base64");
    await pool.query("DELETE FROM user_sessions WHERE user_id=$1 OR expires_at<=NOW()",[user.id]);
    await pool.query(
      "INSERT INTO user_sessions (user_id,token_hash,expires_at) VALUES ($1,$2,NOW()+INTERVAL '30 days')",
      [user.id,sha256(token)]
    );
    res.set("Set-Cookie",cookie("tm_user_session",token,req,60*60*24*30));
    return json(res,{ok:true,user:{nickname:user.nickname,role:user.role}});
  } catch(error){
    console.error("[Titanium Market] POST /api/user/login:",error);
    return json(res,{error:"Ошибка входа."},500);
  }
});

app.get("/api/user/me",async(req,res)=>{
  try {
    const user=await currentUser(req);
    if(!user) return json(res,{authenticated:false});
    return json(res,{authenticated:true,user:{nickname:user.nickname,role:user.role}});
  } catch(error){
    console.error("[Titanium Market] GET /api/user/me:",error);
    return json(res,{error:"Ошибка проверки авторизации."},500);
  }
});

app.post("/api/user/logout",async(req,res)=>{
  try {
    const token=getCookie(req,"tm_user_session");
    if(token) await pool.query("DELETE FROM user_sessions WHERE token_hash=$1",[sha256(token)]);
    res.set("Set-Cookie",clearCookie("tm_user_session",req));
    return json(res,{ok:true});
  } catch(error){
    console.error("[Titanium Market] POST /api/user/logout:",error);
    return json(res,{error:"Ошибка выхода."},500);
  }
});

app.get("/api/user/ads",async(req,res)=>{
  try {
    const user=await userOnly(req,res); if(!user)return;
    await expireAds();
    const result=await pool.query(`
      SELECT ads.id,ads.title,categories.name AS category,ads.city,ads.price,
             users.nickname AS seller,ads.contact,ads.description,ads.vk,
             ads.status,ads.created_at,ads.expires_at,ads.last_extended_at
      FROM ads
      LEFT JOIN categories ON categories.id=ads.category_id
      LEFT JOIN users ON users.id=ads.user_id
      WHERE ads.user_id=$1
      ORDER BY ads.id DESC`,[user.id]);

    const now=Date.now();
    const ads=result.rows.map(row=>{
      const lastExtendedAt=row.last_extended_at?new Date(row.last_extended_at):null;
      const nextExtendAt=lastExtendedAt?new Date(lastExtendedAt.getTime()+5*24*60*60*1000):null;
      return {
        ...rowToAd(row),
        lastExtendedAt:row.last_extended_at,
        canEdit:['approved','rejected'].includes(row.status),
        canExtend:row.status==='approved' && (!nextExtendAt || nextExtendAt.getTime()<=now),
        extendAvailableAt:nextExtendAt ? nextExtendAt.toISOString() : null,
        canRepublish:row.status==='expired'
      };
    });
    return json(res,{ads});
  } catch(error){
    console.error("[Titanium Market] GET /api/user/ads:",error);
    return json(res,{error:"Не удалось загрузить ваши объявления."},500);
  }
});

app.patch("/api/user/ads/:id",async(req,res)=>{
  try {
    const user=await userOnly(req,res); if(!user)return;
    const id=Number(req.params.id);
    if(!id) return json(res,{error:"Некорректное объявление."},400);

    const adResult=await pool.query(
      `SELECT ads.id,ads.title,categories.name AS category,ads.city,ads.price,
              users.nickname AS seller,ads.contact,ads.description,ads.vk,ads.status
       FROM ads
       LEFT JOIN categories ON categories.id=ads.category_id
       LEFT JOIN users ON users.id=ads.user_id
       WHERE ads.id=$1 AND ads.user_id=$2 LIMIT 1`,
      [id,user.id]
    );
    const ad=adResult.rows[0];
    if(!ad) return json(res,{error:"Объявление не найдено в вашем кабинете."},404);
    if(!["approved","rejected"].includes(ad.status)){
      return json(res,{error:"Сейчас это объявление нельзя редактировать. Дождитесь окончания текущей проверки."},400);
    }

    const body=req.body||{};
    const category=String(body.category??ad.category).trim().slice(0,40);
    const isSimCard=category==="Сим-Карты";
    const title=String(body.title??ad.title).trim().slice(0,80);
    const city=isSimCard?"Не указан":String(body.city??ad.city??"Не указан").trim().slice(0,40);
    const price=Math.max(0,Number(body.price??ad.price)||0);
    const contact=String(body.contact??ad.contact??"").trim().slice(0,40);
    const description=String(body.description??ad.description??"").trim().slice(0,500);
    const vk=normalizeVk(body.vk??ad.vk);

    if(!title || !category) return json(res,{error:"Не заполнены обязательные поля."},400);
    if(!contact) return json(res,{error:isSimCard?"Укажите номер телефона.":"Укажите контакт."},400);

    const categoryResult=await pool.query("SELECT id FROM categories WHERE name=$1",[category]);
    const categoryRow=categoryResult.rows[0];
    if(!categoryRow) return json(res,{error:"Неизвестная категория."},400);

    await pool.query(
      `UPDATE ads
       SET title=$1,
           category_id=$2,
           city=$3,
           price=$4,
           description=$5,
           contact=$6,
           vk=$7,
           status='pending',
           expires_at=NULL,
           last_extended_at=NULL
       WHERE id=$8 AND user_id=$9`,
      [title,categoryRow.id,city,price,description,contact,vk,id,user.id]
    );

    const oldTitle=String(ad.title??"");
    await pool.query(
      "INSERT INTO moderation_logs (ad_id,moderator_nickname,action,comment) VALUES ($1,$2,$3,$4)",
      [id,user.nickname,"user_edit",`Пользователь изменил объявление: «${oldTitle}» → «${title}». Изменения отправлены на повторную модерацию.`]
    );

    return json(res,{ok:true,id,status:"pending"});
  } catch(error){
    console.error("[Titanium Market] PATCH /api/user/ads/:id:",error);
    return json(res,{error:"Не удалось отправить изменения на проверку."},500);
  }
});

app.post("/api/user/ads/:id/extend",async(req,res)=>{
  try {
    const user=await userOnly(req,res); if(!user)return;
    const id=Number(req.params.id);
    if(!id) return json(res,{error:"Некорректное объявление."},400);

    const result=await pool.query(
      `SELECT id,status,expires_at,last_extended_at,title
       FROM ads WHERE id=$1 AND user_id=$2 LIMIT 1`,
      [id,user.id]
    );
    const ad=result.rows[0];
    if(!ad) return json(res,{error:"Объявление не найдено в вашем кабинете."},404);
    if(ad.status!=='approved') return json(res,{error:"Продлить можно только опубликованное объявление."},400);

    const last=ad.last_extended_at?new Date(ad.last_extended_at):null;
    if(last && last.getTime()+5*24*60*60*1000>Date.now()){
      return json(res,{error:"Это объявление можно продлить только один раз в 5 дней.",extendAvailableAt:new Date(last.getTime()+5*24*60*60*1000).toISOString()},429);
    }

    await pool.query(
      `UPDATE ads
       SET expires_at=GREATEST(COALESCE(expires_at,NOW()),NOW())+INTERVAL '5 days',
           last_extended_at=NOW()
       WHERE id=$1 AND user_id=$2`,
      [id,user.id]
    );
    return json(res,{ok:true});
  } catch(error){
    console.error("[Titanium Market] POST /api/user/ads/:id/extend:",error);
    return json(res,{error:"Не удалось продлить объявление."},500);
  }
});

app.post("/api/user/ads/:id/republish",async(req,res)=>{
  try {
    const user=await userOnly(req,res); if(!user)return;
    const id=Number(req.params.id);
    if(!id) return json(res,{error:"Некорректное объявление."},400);

    const result=await pool.query(
      `SELECT id,status FROM ads WHERE id=$1 AND user_id=$2 LIMIT 1`,
      [id,user.id]
    );
    const ad=result.rows[0];
    if(!ad) return json(res,{error:"Объявление не найдено в вашем кабинете."},404);
    if(ad.status!=='expired') return json(res,{error:"Повторно опубликовать можно только истёкшее объявление."},400);

    await pool.query(
      `UPDATE ads
       SET status='pending',expires_at=NOW()+INTERVAL '7 days',last_extended_at=NULL
       WHERE id=$1 AND user_id=$2`,
      [id,user.id]
    );
    return json(res,{ok:true,status:"pending"});
  } catch(error){
    console.error("[Titanium Market] POST /api/user/ads/:id/republish:",error);
    return json(res,{error:"Не удалось отправить объявление на повторную проверку."},500);
  }
});


app.delete("/api/user/ads/:id",async(req,res)=>{
  const user=await userOnly(req,res);
  if(!user)return;
  const client=await pool.connect();
  try{
    const id=Number(req.params.id);
    if(!id)return json(res,{error:"Некорректное объявление."},400);

    const adResult=await client.query(
      `SELECT id,title FROM ads WHERE id=$1 AND user_id=$2 LIMIT 1`,
      [id,user.id]
    );
    const ad=adResult.rows[0];
    if(!ad)return json(res,{error:"Объявление не найдено в вашем кабинете."},404);

    await client.query("BEGIN");
    await client.query("DELETE FROM reports WHERE ad_id=$1",[id]);
    await client.query("DELETE FROM moderation_logs WHERE ad_id=$1",[id]);
    await client.query("DELETE FROM ads WHERE id=$1 AND user_id=$2",[id,user.id]);
    await client.query(
      "INSERT INTO moderation_logs (ad_id,moderator_nickname,action,comment) VALUES (NULL,$1,$2,$3)",
      [user.nickname,"user_delete",`Пользователь удалил объявление #${id} «${ad.title}».`]
    );
    await client.query("COMMIT");
    return json(res,{ok:true});
  }catch(error){
    await client.query("ROLLBACK");
    console.error("[Titanium Market] DELETE /api/user/ads/:id:",error);
    return json(res,{error:"Не удалось удалить объявление."},500);
  }finally{
    client.release();
  }
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
    const admin=await adminOnly(req,res);
    if(!admin)return;

    const id=Number(req.params.id);
    const body=req.body||{};
    const ad=await getAd(id);

    if(!ad){
      return json(res,{error:"Объявление не найдено."},404);
    }

    const title=String(body.title??ad.title).trim().slice(0,80);
    const city=String(body.city??ad.city).trim().slice(0,40);
    const price=Math.max(0,Number(body.price??ad.price)||0);
    const seller=String(body.seller??ad.seller).trim().slice(0,32);
    const contact=String(body.contact??ad.contact).trim().slice(0,40);
    const description=String(body.description??ad.description).trim().slice(0,500);
    const vk=normalizeVk(body.vk??ad.vk);
    const category=String(body.category??ad.category).trim().slice(0,40);

    if(!seller){
      return json(res,{error:"Укажите игровой ник."},400);
    }

    const categoryResult=await pool.query(
      "SELECT id FROM categories WHERE name=$1",
      [category]
    );

    const cat=categoryResult.rows[0];

    if(!cat){
      return json(res,{error:"Неизвестная категория."},400);
    }

    /*
      Находим пользователя, которому принадлежит объявление,
      и меняем его ник.
    */
    const userResult=await pool.query(
      "SELECT user_id FROM ads WHERE id=$1",
      [id]
    );

    const userId=userResult.rows[0]?.user_id;

    if(!userId){
      return json(res,{error:"Не удалось определить владельца объявления."},500);
    }

    /*
      Проверяем, не занят ли новый ник другим пользователем.
      Если такой ник уже существует у другого пользователя,
      используем его.
    */
    const existingUserResult=await pool.query(
      "SELECT id FROM users WHERE nickname=$1 LIMIT 1",
      [seller]
    );

    const existingUser=existingUserResult.rows[0];

    if(existingUser && Number(existingUser.id)!==Number(userId)){
      return json(res,{error:"Пользователь с таким игровым ником уже существует."},400);
    }

    const comment=
      `Изменено объявление #${id}: ` +
      `название «${ad.title}» → «${title}»; ` +
      `цена ${ad.price} → ${price}; ` +
      `город «${ad.city}» → «${city}»; ` +
      `категория «${ad.category}» → «${category}»; ` +
      `игровой ник «${ad.seller}» → «${seller}»; ` +
      `контакт «${ad.contact}» → «${contact}».`;

    await pool.query(
      "UPDATE users SET nickname=$1 WHERE id=$2",
      [seller,userId]
    );

    await pool.query(
      "UPDATE ads SET title=$1,category_id=$2,city=$3,price=$4,description=$5,contact=$6,vk=$7 WHERE id=$8",
      [title,cat.id,city,price,description,contact,vk,id]
    );

    await writeLog(id,admin,"edit",comment);

    return json(res,{ok:true});
  } catch(error) {
    console.error("[Titanium Market] PATCH /api/media/ads/:id:",error);
    return json(res,{error:"Не удалось изменить объявление."},500);
  }
});

app.post("/api/media/ads/:id/:action",async(req,res)=>{
  try {
    const admin=await adminOnly(req,res); if(!admin)return;
    const id=Number(req.params.id),action=req.params.action,ad=await getAd(id);
    if(!["approve","reject","archive"].includes(action))return json(res,{error:"Недопустимое действие."},400);
    if(!ad)return json(res,{error:"Объявление не найдено."},404);
    const body=req.body||{},status=action==='approve'?'approved':action==='reject'?'rejected':'archived';
    if(action==='reject'&&!String(body.reason??"").trim())return json(res,{error:"Укажите причину отклонения."},400);
    if(action==='approve') {
      await pool.query(
        `UPDATE ads
         SET status='approved',
             expires_at=CASE WHEN expires_at IS NULL OR expires_at<=NOW() THEN NOW()+INTERVAL '7 days' ELSE expires_at END
         WHERE id=$1`,
        [id]
      );
    } else {
      await pool.query("UPDATE ads SET status=$1 WHERE id=$2",[status,id]);
    }
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

const dist = path.join(__dirname, "dist");

app.use(
  express.static(dist, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) {
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, proxy-revalidate"
        );
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader(
          "Cache-Control",
          "public, max-age=31536000, immutable"
        );
      }
    }
  })
);

// SPA fallback.
// Если запрошен отсутствующий JS/CSS из /assets,
// не возвращаем index.html вместо файла.
app.get(/.*/, (req, res) => {
  if (req.path.startsWith("/assets/")) {
    return res.status(404).send("Asset not found");
  }

  return res.sendFile(path.join(dist, "index.html"), {
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Titanium Market] listening on port ${PORT}`);
  console.log("[Titanium Market] database: Supabase PostgreSQL");
});

async function shutdown(signal){
  console.log(`[Titanium Market] ${signal} received, shutting down...`);
  server.close(async()=>{ try { await pool.end(); } finally { process.exit(0); } });
}
process.on("SIGTERM",()=>shutdown("SIGTERM"));
process.on("SIGINT",()=>shutdown("SIGINT"));
