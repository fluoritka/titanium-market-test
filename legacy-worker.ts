export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

type AdminAccount = { id:number; username:string; display_name:string; role:'admin'|'root'; password_salt:string; password_hash:string };

function json(data: unknown, status = 200, extraHeaders: Record<string,string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store', ...extraHeaders }
  });
}

function cookie(name:string, value:string, request:Request, maxAge:number) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearCookie(name:string, request:Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function getCookie(request:Request, name:string) {
  const header = request.headers.get('Cookie') || '';
  const item = header.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='));
  return item ? decodeURIComponent(item.slice(name.length+1)) : null;
}

function bytesToB64(bytes:ArrayBuffer|Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s='';
  for(let i=0;i<arr.length;i+=0x8000) s += String.fromCharCode(...arr.subarray(i,i+0x8000));
  return btoa(s);
}

function b64ToBytes(value:string) {
  const s=atob(value); const out=new Uint8Array(s.length);
  for(let i=0;i<s.length;i++) out[i]=s.charCodeAt(i);
  return out;
}

async function sha256(value:string) {
  return bytesToB64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function verifyPassword(password:string, saltB64:string, hashB64:string) {
  const key=await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:b64ToBytes(saltB64),iterations:100000,hash:'SHA-256'},key,256);
  const actual=new Uint8Array(bits), expected=b64ToBytes(hashB64);
  if(actual.length!==expected.length) return false;
  let diff=0; for(let i=0;i<actual.length;i++) diff|=actual[i]^expected[i];
  return diff===0;
}

async function currentAdmin(request:Request, db:D1Database):Promise<AdminAccount|null> {
  const token=getCookie(request,'tm_session');
  if(!token) return null;
  const tokenHash=await sha256(token);
  const row=await db.prepare(`
    SELECT a.id,a.username,a.display_name,a.role,a.password_salt,a.password_hash
    FROM admin_sessions s JOIN admin_accounts a ON a.id=s.admin_id
    WHERE s.token_hash=? AND s.expires_at > datetime('now') AND a.is_active=1
  `).bind(tokenHash).first<AdminAccount>();
  return row || null;
}

async function requireAdmin(request:Request, db:D1Database) {
  const admin=await currentAdmin(request,db);
  return admin;
}

function rowToAd(row:any) {
  return { id:Number(row.id), title:row.title, category:row.category, city:row.city, price:Number(row.price||0), seller:row.seller, contact:row.contact, description:row.description, status:row.status, createdAt:row.created_at, expiresAt:row.expires_at };
}

async function expireAds(db:D1Database) {
  await db.prepare(`UPDATE ads SET status='expired' WHERE status='approved' AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')`).run();
}

async function getAds(db:D1Database, status='pending') {
  await expireAds(db);
  let where='ads.status=?'; const params:any[]=[status];
  if(status==='approved') where += " AND (ads.expires_at IS NULL OR datetime(ads.expires_at)>datetime('now'))";
  const result=await db.prepare(`SELECT ads.id,ads.title,categories.name AS category,ads.city,ads.price,users.nickname AS seller,ads.contact,ads.description,ads.status,ads.created_at,ads.expires_at FROM ads LEFT JOIN categories ON categories.id=ads.category_id LEFT JOIN users ON users.id=ads.user_id WHERE ${where} ORDER BY ads.id DESC`).bind(...params).all();
  return result.results.map(rowToAd);
}

async function getAd(db:D1Database,id:number) {
  return db.prepare(`SELECT ads.id,ads.title,categories.name AS category,ads.city,ads.price,users.nickname AS seller,ads.contact,ads.description,ads.status,ads.created_at,ads.expires_at FROM ads LEFT JOIN categories ON categories.id=ads.category_id LEFT JOIN users ON users.id=ads.user_id WHERE ads.id=?`).bind(id).first<any>();
}

async function writeLog(db:D1Database, adId:number|null, admin:AdminAccount, action:string, comment:string|null) {
  await db.prepare('INSERT INTO moderation_logs (ad_id,moderator_nickname,action,comment) VALUES (?,?,?,?)').bind(adId,admin.username,action,comment).run();
}

export default {
  async fetch(request:Request, env:Env):Promise<Response> {
    const url=new URL(request.url);

    if(url.pathname==='/api/health') return json({ok:true,service:'titanium-market',database:true});

    if(url.pathname==='/api/ads' && request.method==='GET') return json({ads:await getAds(env.DB,'approved')});

    if(url.pathname==='/api/ads' && request.method==='POST') {
      const body=await request.json().catch(()=>null) as any;
      if(!body?.title||!body?.category||!body?.seller||!body?.contact) return json({error:'Не заполнены обязательные поля.'},400);
      const title=String(body.title).trim().slice(0,80), category=String(body.category).trim().slice(0,40), city=String(body.city??'Не указан').trim().slice(0,40), price=Math.max(0,Number(body.price??0)||0), seller=String(body.seller).trim().slice(0,32), contact=String(body.contact).trim().slice(0,40), description=String(body.description??'').trim().slice(0,500);
      const categoryRow=await env.DB.prepare('SELECT id FROM categories WHERE name=?').bind(category).first<{id:number}>();
      if(!categoryRow) return json({error:'Неизвестная категория.'},400);
      let user=await env.DB.prepare('SELECT id FROM users WHERE nickname=?').bind(seller).first<{id:number}>();
      if(!user){ await env.DB.prepare("INSERT INTO users (nickname,role) VALUES (?,'player')").bind(seller).run(); user=await env.DB.prepare('SELECT id FROM users WHERE nickname=?').bind(seller).first<{id:number}>(); }
      if(!user) return json({error:'Не удалось создать пользователя.'},500);
      const result=await env.DB.prepare(`INSERT INTO ads (user_id,title,category_id,city,price,description,contact,status,expires_at) VALUES (?,?,?,?,?,?,?,'pending',datetime('now','+7 days'))`).bind(user.id,title,categoryRow.id,city,price,description,contact).run();
      return json({ok:true,adId:Number(result.meta.last_row_id),status:'pending'},201);
    }

    if(url.pathname==='/api/ads/report' && request.method==='POST') {
      const body=await request.json().catch(()=>null) as any; const adId=Number(body?.adId), reporter=String(body?.reporter??'Аноним').trim().slice(0,32), reason=String(body?.reason??'').trim().slice(0,300);
      if(!adId||!reason) return json({error:'Укажите объявление и причину.'},400);
      const ad=await env.DB.prepare("SELECT id FROM ads WHERE id=? AND status='approved'").bind(adId).first(); if(!ad) return json({error:'Объявление не найдено.'},404);
      await env.DB.prepare("INSERT INTO reports (ad_id,reporter_nickname,reason,status) VALUES (?,?,?,'open')").bind(adId,reporter,reason).run(); return json({ok:true},201);
    }

    if(url.pathname==='/api/media/login' && request.method==='POST') {
      const body=await request.json().catch(()=>null) as any; const username=String(body?.username??'').trim(); const password=String(body?.password??'');
      if(!username||!password) return json({error:'Введите логин и пароль.'},400);
      const admin=await env.DB.prepare('SELECT * FROM admin_accounts WHERE username=? AND is_active=1').bind(username).first<AdminAccount>();
      if(!admin || !(await verifyPassword(password,admin.password_salt,admin.password_hash))) return json({error:'Неверный логин или пароль.'},401);
      const token=bytesToB64(crypto.getRandomValues(new Uint8Array(32))); const tokenHash=await sha256(token);
      await env.DB.prepare("DELETE FROM admin_sessions WHERE admin_id=? OR expires_at<=datetime('now')").bind(admin.id).run();
      await env.DB.prepare("INSERT INTO admin_sessions (admin_id,token_hash,expires_at) VALUES (?,?,datetime('now','+30 days'))").bind(admin.id,tokenHash).run();
      return json({ok:true,user:{nickname:admin.username,displayName:admin.display_name,role:admin.role}},200,{'Set-Cookie':cookie('tm_session',token,request,60*60*24*30)});
    }

    if(url.pathname==='/api/media/me' && request.method==='GET') {
      const admin=await currentAdmin(request,env.DB); if(!admin) return json({authenticated:false});
      return json({authenticated:true,user:{nickname:admin.username,displayName:admin.display_name,role:admin.role}});
    }

    if(url.pathname==='/api/media/logout' && request.method==='POST') {
      const token=getCookie(request,'tm_session'); if(token) await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await sha256(token)).run();
      return json({ok:true},200,{'Set-Cookie':clearCookie('tm_session',request)});
    }

    const admin=await requireAdmin(request,env.DB);

    if(url.pathname==='/api/media/stats' && request.method==='GET') {
      if(!admin) return json({error:'Требуется авторизация.'},401); await expireAds(env.DB);
      const result=await env.DB.prepare('SELECT status,COUNT(*) AS count FROM ads GROUP BY status').all(); const reports=await env.DB.prepare("SELECT COUNT(*) AS count FROM reports WHERE status='open'").first<{count:number}>(); const stats:Record<string,number>={pending:0,approved:0,rejected:0,archived:0,expired:0}; for(const row of result.results as any[]) stats[row.status]=Number(row.count); stats.reports=Number(reports?.count??0); return json(stats);
    }

    if(url.pathname==='/api/media/ads' && request.method==='GET') {
      if(!admin) return json({error:'Требуется авторизация.'},401); const status=url.searchParams.get('status')||'pending'; const allowed=['pending','approved','rejected','archived','expired']; if(!allowed.includes(status)) return json({error:'Недопустимый статус.'},400); return json({ads:await getAds(env.DB,status)});
    }

    if(url.pathname==='/api/media/reports' && request.method==='GET') {
      if(!admin) return json({error:'Требуется авторизация.'},401); const result=await env.DB.prepare(`SELECT reports.id,reports.ad_id,reports.reporter_nickname,reports.reason,reports.status,reports.created_at,ads.title FROM reports LEFT JOIN ads ON ads.id=reports.ad_id WHERE reports.status='open' ORDER BY reports.id DESC`).all(); return json({reports:result.results});
    }

    if(url.pathname==='/api/media/logs' && request.method==='GET') {
      if(!admin) return json({error:'Требуется авторизация.'},401);
      if(admin.role==='root') { const result=await env.DB.prepare('SELECT id,ad_id,moderator_nickname,action,comment,created_at FROM moderation_logs ORDER BY id DESC LIMIT 500').all(); return json({logs:result.results,scope:'all'}); }
      const result=await env.DB.prepare('SELECT id,ad_id,moderator_nickname,action,comment,created_at FROM moderation_logs WHERE moderator_nickname=? ORDER BY id DESC LIMIT 100').bind(admin.username).all(); return json({logs:result.results,scope:'own'});
    }

    const editMatch=url.pathname.match(/^\/api\/media\/ads\/(\d+)$/);
    if(editMatch && request.method==='PATCH') {
      if(!admin) return json({error:'Требуется авторизация.'},401); const id=Number(editMatch[1]); const body=await request.json().catch(()=>null) as any; const ad=await getAd(env.DB,id); if(!ad) return json({error:'Объявление не найдено.'},404);
      const title=String(body?.title??ad.title).trim().slice(0,80), city=String(body?.city??ad.city).trim().slice(0,40), price=Math.max(0,Number(body?.price??ad.price)||0), contact=String(body?.contact??ad.contact).trim().slice(0,40), description=String(body?.description??ad.description).trim().slice(0,500), category=String(body?.category??ad.category).trim().slice(0,40); const cat=await env.DB.prepare('SELECT id FROM categories WHERE name=?').bind(category).first<{id:number}>(); if(!cat) return json({error:'Неизвестная категория.'},400);
      const comment=`Изменено объявление #${id}: название «${ad.title}» → «${title}»; цена ${ad.price} → ${price}; город «${ad.city}» → «${city}»; категория «${ad.category}» → «${category}»; контакт «${ad.contact}» → «${contact}».`;
      await env.DB.prepare('UPDATE ads SET title=?,category_id=?,city=?,price=?,description=?,contact=? WHERE id=?').bind(title,cat.id,city,price,description,contact,id).run(); await writeLog(env.DB,id,admin,'edit',comment); return json({ok:true});
    }

    const actionMatch=url.pathname.match(/^\/api\/media\/ads\/(\d+)\/(approve|reject|archive)$/);
    if(actionMatch && request.method==='POST') {
      if(!admin) return json({error:'Требуется авторизация.'},401); const id=Number(actionMatch[1]), action=actionMatch[2], ad=await getAd(env.DB,id); if(!ad) return json({error:'Объявление не найдено.'},404); const body=await request.json().catch(()=>null) as any; const status=action==='approve'?'approved':action==='reject'?'rejected':'archived'; if(action==='reject'&&!String(body?.reason??'').trim()) return json({error:'Укажите причину отклонения.'},400); await env.DB.prepare('UPDATE ads SET status=? WHERE id=?').bind(status,id).run(); const comment=action==='reject'?`Причина: ${String(body.reason).trim().slice(0,300)}`:action==='archive'?'Объявление снято с публикации.':'Объявление одобрено.'; await writeLog(env.DB,id,admin,action,comment); return json({ok:true,id,status});
    }

    const deleteMatch=url.pathname.match(/^\/api\/media\/ads\/(\d+)$/);
    if(deleteMatch && request.method==='DELETE') {
      if(!admin) return json({error:'Требуется авторизация.'},401); const id=Number(deleteMatch[1]); const ad=await getAd(env.DB,id); if(!ad) return json({error:'Объявление не найдено.'},404);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM reports WHERE ad_id=?').bind(id),
        env.DB.prepare('DELETE FROM ads WHERE id=?').bind(id),
        env.DB.prepare('INSERT INTO moderation_logs (ad_id,moderator_nickname,action,comment) VALUES (NULL,?,?,?)').bind(admin.username,'delete',`Удалено объявление #${id} «${ad.title}».`)
      ]);
      return json({ok:true});
    }

    if(url.pathname==='/api/media/reports/resolve' && request.method==='POST') {
      if(!admin) return json({error:'Требуется авторизация.'},401); const body=await request.json().catch(()=>null) as any; const id=Number(body?.id); const action=body?.action==='dismiss'?'dismissed':'resolved'; if(!id) return json({error:'Некорректная жалоба.'},400);
      const report=await env.DB.prepare('SELECT ad_id,reason FROM reports WHERE id=?').bind(id).first<{ad_id:number,reason:string}>(); if(!report) return json({error:'Жалоба не найдена.'},404);
      await env.DB.prepare('UPDATE reports SET status=? WHERE id=?').bind(action,id).run(); await writeLog(env.DB,report.ad_id,admin,`report_${action}`,report.reason); return json({ok:true});
    }

    return env.ASSETS.fetch(request);
  }
};
