/**
 * מחיר בכתב גברת לוין: בגופן הזה סימן ה-₪ נדבק לספרה שלידו, לכן הסימן מוצג בגופן הרגיל ועם רווח.
 */
export function GateShekel({ agorot }: { agorot: number }) {
  return (
    <span className="gate-shekel-wrap">
      <span>{(agorot / 100).toLocaleString("he-IL", { maximumFractionDigits: 2 })}</span>
      <span className="gate-shekel">₪</span>
    </span>
  );
}
