// Retired. Was a temporary diagnostic function used on 2026-08-15 to isolate
// a 360dialog billing block and a WhatsApp authentication-template button
// payload bug from the Supabase Auth hook chain. No dashboard "delete"
// option was available, so this was neutralized in place instead: no
// longer sends anything, and requires a valid JWT to even reach this
// response.
Deno.serve(() => new Response('Retired debug function.', { status: 410 }));
