const {json,cors,env}=require('./_supabase');

module.exports=async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  try{
    const publicKey=process.env.VAPID_PUBLIC_KEY||'';
    const privateKey=process.env.VAPID_PRIVATE_KEY||'';
    const subject=process.env.VAPID_SUBJECT||'';
    const enabled=!!(publicKey&&privateKey&&subject&&process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.SUPABASE_URL);
    return json(res,200,{enabled,publicKey:publicKey||null});
  }catch(e){return json(res,500,{enabled:false,error:e.message||'Web Push config error'});}
};
