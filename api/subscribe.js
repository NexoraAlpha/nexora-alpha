const {supabaseUserFromRequest,supabaseRest}=require('./_supabase');
module.exports=async function(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const user=await supabaseUserFromRequest(req);
    if(!user?.id) return res.status(401).json({error:'Unauthorized'});
    const s=req.body?.subscription || req.body;
    if(!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) return res.status(400).json({error:'Subscription Web Push tidak lengkap.'});
    if(!/^https:\/\//i.test(String(s.endpoint))) return res.status(400).json({error:'Endpoint push tidak valid.'});
    await supabaseRest('push_subscriptions?on_conflict=endpoint',{
      method:'POST',
      headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({
        user_id:user.id, endpoint:String(s.endpoint), p256dh:String(s.keys.p256dh), auth:String(s.keys.auth),
        expiration_time:s.expirationTime ?? null, user_agent:req.headers['user-agent']||null, updated_at:new Date().toISOString()
      })
    });
    return res.status(200).json({ok:true});
  }catch(e){ console.error('push subscribe',e); return res.status(e.status||500).json({error:e.message||'Gagal menyimpan subscription.'}); }
};
