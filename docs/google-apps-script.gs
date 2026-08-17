/**
 * Google Apps Script – שרת המייל של האתר (אותו מודל כמו במערכת הגמ"ח).
 *
 * התקנה:
 * 1. היכנסי ל-https://script.google.com עם חשבון ה-Gmail שממנו יישלחו המיילים.
 * 2. פרויקט חדש → הדביקי את הקוד הזה → שמרי.
 * 3. פריסה (Deploy) → New deployment → סוג: Web app
 *    Execute as: Me   |   Who has access: Anyone
 * 4. העתיקי את כתובת ה-Web App והגדירי אותה כמשתנה סביבה MAIL_SCRIPT_URL ב-Vercel.
 *
 * הסקריפט מקבל POST עם JSON:
 * { to, cc, subject, body, htmlBody, fromName, fileName, fileContent(base64), mimeType }
 * ומחזיר { status: "success" } או { status: "error", message }.
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (!data.to) throw new Error("missing 'to'");

    var options = { name: data.fromName || "חומרים לבגרות" };
    if (data.cc) options.cc = data.cc;
    if (data.htmlBody) options.htmlBody = data.htmlBody;

    if (data.fileContent && data.fileName) {
      var bytes = Utilities.base64Decode(data.fileContent);
      var blob = Utilities.newBlob(bytes, data.mimeType || "application/octet-stream", data.fileName);
      // קובץ message.txt הוא רק placeholder של המערכת – לא מצרפים אותו בפועל
      if (data.fileName !== "message.txt") options.attachments = [blob];
    }

    GmailApp.sendEmail(data.to, data.subject || "הודעה חדשה", data.body || "", options);
    return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(
      ContentService.MimeType.JSON
    );
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: String(err && err.message ? err.message : err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ status: "ok", service: "bagrut-mail" })).setMimeType(
    ContentService.MimeType.JSON
  );
}
