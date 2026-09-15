const {env}=require('./_supabase');
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const publicKey=env('VAPID_PUBLIC_KEY');
  if(!publicKey) return res.status(503).json({enabled:false,error:'VAPID_PUBLIC_KEY belum diatur.'});
  return res.status(200).json({enabled:true,publicKey});
};
