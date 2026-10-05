"use client";

import { XCircle } from "lucide-react";
import { cancelOrderAction } from "@/lib/actions/purchase-cancel";

/** ביטול הזמנה לפני הורדה, עם אישור לפני שליחה */
export function CancelOrderButton({ purchaseId, refundText }: { purchaseId: number; refundText: string }) {
  return (
    <form
      action={cancelOrderAction}
      onSubmit={(e) => {
        if (!window.confirm(`לבטל את ההזמנה ולקבל זיכוי מלא של ${refundText}? לא ניתן לשחזר אחרי הביטול.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <button
        type="submit"
        className="flex items-center gap-1 text-base underline underline-offset-4 transition-transform hover:-translate-y-0.5"
        title="ביטול מיידי וזיכוי מלא – אפשרי כל עוד לא הורדת קבצים"
      >
        <XCircle className="h-4 w-4" aria-hidden /> ביטול והחזר כספי
      </button>
    </form>
  );
}
