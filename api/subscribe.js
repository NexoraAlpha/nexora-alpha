const {json,cors,env,supabaseAuthUser,db,bearer}=require('./_supabase');

module.exports=async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  try{
    const token=bearer(req);if(!token) return json(res,401,{error:'Authorization diperlukan.'});
    const user=await supabaseAuthUser(token);
    const sub=req.body?.subscription;
    if(!sub?.endpoint||!sub?.keys?.p256dh||!sub?.keys?.auth){return json(res,400,{error:'Push subscription tidak lengkap.'});}
    const row={
      user_id:user.id,
      endpoint:String(sub.endpoint),
      p256dh:String(sub.keys.p256dh),
      auth:String(sub.keys.auth),
      expiration_time:sub.expirationTime==null?null:Number(sub.expirationTime)||null,
      user_agent:req.headers['user-agent']||null,
      updated_at:new Date().toISOString()
    };
    await db('push_subscriptions?on_conflict=endpoint',{method:'POST',body:row,prefer:'resolution=merge-duplicates,return=minimal'});
    return json(res,200,{ok:true});
  }catch(e){return json(res,e.status||500,{error:e.message||'Gagal menyimpan push subscription.'});}
};
