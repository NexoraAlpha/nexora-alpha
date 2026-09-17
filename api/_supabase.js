const base=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
function json(res,status,body){res.status(status).setHeader('Content-Type','application/json');return res.end(JSON.stringify(body));}
function cors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');}
async function db(path,opts={}){
  if(!base||!key) throw new Error('Supabase server env belum lengkap');
  const r=await fetch(base+'/rest/v1/'+path,{...opts,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(opts.headers||{})}});
  const text=await r.text(); let data=null; try{data=text?JSON.parse(text):null}catch{}
  if(!r.ok) throw new Error((data&&data.message)||text||('Supabase HTTP '+r.status));
  return data;
}
async function authUser(req){
  const h=req.headers.authorization||''; if(!h.startsWith('Bearer ')) return null;
  const token=h.slice(7);
  const r=await fetch(base+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+token}});
  if(!r.ok)return null; return r.json();
}
async function isAdmin(req){const u=await authUser(req); if(!u?.id)return null; const rows=await db('profiles?id=eq.'+encodeURIComponent(u.id)+'&select=id,role&limit=1'); return rows?.[0]?.role==='admin'?u:null;}
module.exports={json,cors,db,authUser,isAdmin};
