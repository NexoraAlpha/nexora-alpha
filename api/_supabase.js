function env(name){ return process.env[name] || ''; }

async function supabaseUserFromRequest(req){
  const auth = req.headers.authorization || '';
  if(!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if(!token) return null;
  const url = env('SUPABASE_URL');
  const anon = env('SUPABASE_ANON_KEY');
  if(!url || !anon) throw new Error('Supabase server config belum lengkap.');
  const r = await fetch(url.replace(/\/$/, '') + '/auth/v1/user', {
    headers: { apikey: anon, Authorization: 'Bearer ' + token }
  });
  if(!r.ok) return null;
  return r.json();
}

function requireServerConfig(){
  const url=env('SUPABASE_URL'), key=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diatur di Vercel.');
  return {url:url.replace(/\/$/,''), key};
}

async function supabaseRest(path, options={}){
  const {url,key}=requireServerConfig();
  const headers={apikey:key, Authorization:'Bearer '+key, ...(options.headers||{})};
  const r=await fetch(url+'/rest/v1/'+path,{...options,headers});
  const text=await r.text();
  let data=null; try{data=text?JSON.parse(text):null}catch(_){data=text}
  if(!r.ok){ const err=new Error((data&&data.message)||String(data)||('Supabase HTTP '+r.status)); err.status=r.status; throw err; }
  return data;
}

module.exports={env,supabaseUserFromRequest,supabaseRest,requireServerConfig};
