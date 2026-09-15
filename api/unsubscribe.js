const {json,cors,supabaseAuthUser,db,bearer}=require('./_supabase');

module.exports=async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  try{
    const token=bearer(req);if(!token)return json(res,401,{error:'Authorization diperlukan.'});
    const user=await supabaseAuthUser(token);
    const endpoint=String(req.body?.endpoint||'');
    if(!endpoint)return json(res,400,{error:'Endpoint subscription tidak ditemukan.'});
    await db(`push_subscriptions?user_id=eq.${encodeURIComponent(user.id)}&endpoint=eq.${encodeURIComponent(endpoint)}`,{method:'DELETE',prefer:'return=minimal'});
    return json(res,200,{ok:true});
  }catch(e){return json(res,e.status||500,{error:e.message||'Gagal menghapus push subscription.'});}
};
