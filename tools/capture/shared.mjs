// Shared by the capture endpoint (vite-plugin.mjs) and the interactive recording session (record.mjs).
export const DPR_MAX=8,MAX_PX_W=16384;
export const UA_PHONE='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
export const UA_TABLET='Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
// short, user-facing reasons for common navigation failures
export function reason(e){const m=String(e&&e.message||e);
  if(/ERR_NAME_NOT_RESOLVED/.test(m))return 'adres bulunamadı';if(/Timeout|ERR_TIMED_OUT/.test(m))return 'sayfa zamanında yüklenmedi';
  if(/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/.test(m))return 'bağlantı kurulamadı';
  if(/ERR_CERT|SSL/.test(m))return 'güvenlik sertifikası geçersiz';if(/ERR_INTERNET_DISCONNECTED/.test(m))return 'internet bağlantısı yok';
  if(/ERR_ABORTED/.test(m))return 'yükleme yarıda kesildi';
  return m.split('\n')[0];}
// the UA for a mobile viewport (a tablet above 600 CSS px)
export const mobileUA=(mobile,width)=>mobile?(width>600?UA_TABLET:UA_PHONE):undefined;
