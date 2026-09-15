const {supabaseUserFromRequest,supabaseRest}=require('./_supabase');
module.exports=async function(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const user=await supabaseUserFromRequest(req);
    if(!user?.id) return res.status(401).json({error:'Unauthorized'});
    const endpoint=String(req.body?.endpoint||'');
    if(!endpoint) return res.status(400).json({error:'Endpoint wajib diisi.'});
    const encoded=encodeURIComponent(endpoint);
    await supabaseRest(`push_subscriptions?user_id=eq.${encodeURIComponent(user.id)}&endpoint=eq.${encoded}`,{method:'DELETE',headers:{'Prefer':'return=minimal'}});
    return res.status(200).json({ok:true});
  }catch(e){ console.error('push unsubscribe',e); return res.status(e.status||500).json({error:e.message||'Gagal mematikan push.'}); }
};
