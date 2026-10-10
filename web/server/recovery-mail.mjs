const address = value => typeof value === 'string' && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value) && value.length <= 254;
export function recoveryConfigured(env) {
  return !!env.RECOVERY_EMAIL?.send && address(env.RECOVERY_FROM) && /^[a-f0-9]{64}$/i.test(env.RECOVERY_SECRET || '');
}
async function deliver(env,message){
  let timer;try{return await Promise.race([env.RECOVERY_EMAIL.send(message),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Email delivery timed out.')),20000)})])}finally{clearTimeout(timer)}
}
export async function sendRecoveryCode(env, email, code) {
  if (!recoveryConfigured(env) || !address(email) || !/^\d{8}$/.test(code)) throw Error('Recovery email is not configured.');
  // The recipient is the server-verified Access identity, never a client-supplied address.
  await deliver(env,{
    from: env.RECOVERY_FROM, to: email,
    subject: 'HardEarner - Kasa sifirlama / Vault reset',
    text: `HardEarner\n\nKasa sıfırlama kodun / Your vault reset code:\n\n${code}\n\nKod 10 dakika geçerlidir ve yalnızca bir kez kullanılabilir. Bu işlem eski kasanı açmaz: yeni, boş bir kasa oluşturur. Eski şifreli kayıtlar arşivlenir; açılmaları için eski şifre gerekir.\n\nThis code expires in 10 minutes and can be used once. Reset starts a new empty vault. Your previous encrypted vault is archived and still needs its original password.\n\nBu isteği sen yapmadıysan kodu kullanma veya paylaşma. Kasan değişmedi.\nIf you did not request this, ignore this email. Your vault has not changed. Never share the code, your password or API keys.`,
  });
}
export async function sendResetNotice(env,email){
  if(!recoveryConfigured(env)||!address(email))throw Error('Recovery email is not configured.');
  await deliver(env,{from:env.RECOVERY_FROM,to:email,subject:'HardEarner - Kasa sifirlandi / Vault reset completed',text:'HardEarner\n\nE-posta koduyla yeni, boş bir kasa oluşturuldu. Eski şifreli kasanın arşivi Ayarlarda korunuyor; açmak için eski şifre gerekiyor.\n\nA new empty vault was created after email-code verification. Your previous encrypted vault is archived in Settings and still requires its original password.\n\nBu işlemi sen yapmadıysan / If this was not you: can.yazicioglu.p@gmail.com ile iletişime geç / contact support. Never send passwords, codes or API secrets.'});
}
