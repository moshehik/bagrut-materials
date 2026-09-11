# שירות המרה Word/PowerPoint -> PDF עצמאי (LibreOffice בתוך Gotenberg), עם
# גופני העברית האמיתיים של האתר מותקנים בפועל - כדי ש-LibreOffice ישתמש בהם
# ישירות במקום להחליף אותם (הבעיה שגילינו עם Google Drive: פונטים לא-סטנדרטיים
# מוחלפים בשקט בפונט גנרי). מריצים כמות שהוא, אין קוד משלנו כאן - רק גופנים.
FROM gotenberg/gotenberg:8

USER root
COPY fonts/*.ttf /usr/share/fonts/truetype/custom/
RUN fc-cache -f -v
USER gotenberg
