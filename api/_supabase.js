function env(name){
  const value=process.env[name];
  if(!value) throw new Error(`${name} belum diatur di Vercel.`);
  return value;
}

function json(res,status,payload){
  res.status(status).setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  return res.end(JSON.stringify(payload));
}

function cors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
}

async function supabaseAuthUser(token){
  const url=env('SUPABASE_URL');
  const key=env('SUPABASE_SERVICE_ROLE_KEY');
  const r=await fetch(`${url}/auth/v1/user`,{
    headers:{apikey:key,Authorization:`Bearer ${token}`}
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data?.id){
    const e=new Error(data?.msg||data?.message||'Sesi login tidak valid.');
    e.status=401;
    throw e;
  }
  return data;
}

async function db(path,{method='GET',body,prefer}={}){
  const url=env('SUPABASE_URL');
  const key=env('SUPABASE_SERVICE_ROLE_KEY');
  const headers={apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json'};
  if(body!==undefined){headers['Content-Type']='application/json';}
  if(prefer)headers.Prefer=prefer;
  const r=await fetch(`${url}/rest/v1/${path}`,{
    method,
    headers,
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const text=await r.text();
  let data=null;try{data=text?JSON.parse(text):null}catch(_){data=text}
  if(!r.ok){
    const e=new Error(data?.message||data?.hint||data?.details||String(data)||`Supabase REST error ${r.status}`);
    e.status=r.status;e.data=data;throw e;
  }
  return data;
}

function bearer(req){
  const raw=req.headers.authorization||req.headers.Authorization||'';
  return raw.replace(/^Bearer\s+/i,'').trim();
}

module.exports={env,json,cors,supabaseAuthUser,db,bearer};
