// שולח מייל למנהלת האתר דרך מערכת המייל של האתר (Apps Script, MAIL_SCRIPT_URL), באותו פורמט כמו sendMail() ב-src/lib/mail.ts,
// ורושם ב-email_logs (kind="agent") כדי שיופיע ב-/admin/mail.
// שימוש: node scripts/send-admin-mail.cjs --subject "נושא" --file path/to/body.txt [--to כתובת] [--dry]
// ברירת מחדל לנמען: הכתובת הראשונה ב-ADMIN_EMAILS (מ-.env.local). לא מדפיס כתובות ולא את ה-URL.
// זו פעולת שליחה בשם המשתמשת: להפעיל רק על פי בקשה מפורשת שלה (CLAUDE.md, "Site mail").
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
for (const f of ['.env.local', '.env']) { const p = path.join(root, f); if (!fs.existsSync(p)) continue; for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } }
const argv = process.argv.slice(2); const arg = k => { const i = argv.indexOf('--' + k); return i < 0 ? null : argv[i + 1]; };
const subject = arg('subject'), file = arg('file'); const dry = argv.includes('--dry');
if (!subject || !file) { console.error('חסר --subject או --file'); process.exit(1); }
const to = arg('to') || (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean)[0];
if (!to) { console.error('אין נמען (ADMIN_EMAILS ריק)'); process.exit(1); }
if (!process.env.MAIL_SCRIPT_URL) { console.error('MAIL_SCRIPT_URL לא מוגדר'); process.exit(1); }
const text = fs.readFileSync(path.resolve(file), 'utf8'); const rtl = t => t.split('\n').map(l => (l.trim() ? '‏' + l : l)).join('\n');
const fromName = process.env.MAIL_FROM_NAME || 'לו״ז העניין';
const payload = { to, cc: '', subject, body: rtl(text), htmlBody: '', fromName, senderName: fromName, fileName: 'message.txt', fileContent: Buffer.from('נשלח ממערכת ' + fromName).toString('base64'), mimeType: 'text/plain', noAttachment: true };
(async () => {
  if (dry) { console.log('dry: היה נשלח אל נמען שמוגדר, נושא:', subject, '| אורך גוף:', text.length); return; }
  let ok = false, err = '';
  try { const res = await fetch(process.env.MAIL_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), redirect: 'follow' }); const txt = await res.text(); let r; try { r = JSON.parse(txt); } catch { r = { status: 'error', message: txt.slice(0, 300) }; } ok = r.status === 'success'; err = r.message || ('HTTP ' + res.status); } catch (e) { err = String(e.message || e); }
  console.log(ok ? 'נשלח בהצלחה' : 'נכשל: ' + err);
  try { // רישום ב-email_logs
    const { neon } = require('@neondatabase/serverless'); const sql = neon(process.env.DATABASE_URL);
    await sql`INSERT INTO email_logs ("to", subject, body, kind, status, error_message) VALUES (${to}, ${subject}, ${text}, ${'agent'}, ${ok ? 'success' : 'error'}, ${ok ? null : err})`; console.log('נרשם ב-email_logs');
  } catch (e) { console.log('הרישום ב-email_logs לא הצליח (המייל עצמו לא מושפע):', String(e.message || e).slice(0, 120)); }
  process.exit(ok ? 0 : 2);
})();
