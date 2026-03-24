import { redirect } from "next/navigation";

// Root redirects to the business dashboard (middleware guards auth)
export default function RootPage() {
  redirect("/business/dashboard");
}
