// The entry: the sign-in page (/studio/login, decided before anything is drawn by tools/site/routes-plugin.mjs) loads
// only its form; every other page the studio. A build without accounts has no sign-in page.
if(document.documentElement.classList.contains('route-login'))import('./login.js');
else import('./main.js');
