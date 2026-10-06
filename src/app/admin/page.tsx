import type { Metadata } from "next";
import AdminPanel from "@/components/AdminPanel";

export const metadata: Metadata = {
  title: "Painel | MI Diversão",
  robots: { index: false, follow: false },
};

/** Painel dos donos. O login é feito no próprio componente (senha + cookie de sessão). */
export default function AdminPage() {
  return <AdminPanel />;
}
