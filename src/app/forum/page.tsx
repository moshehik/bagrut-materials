import { redirect } from "next/navigation";

/**
 * אין יותר פורום כללי נפרד – פורום המורות מוטמע בכל יחידת לימוד
 * (בתחתית כל דף יחידה תחת "המקצועות"). דיונים בודדים עדיין ב-/forum/[id].
 */
export default function ForumIndexRedirect() {
  redirect("/subjects");
}
