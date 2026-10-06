import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MI Diversão | Locação de Brinquedos",
  description:
    "Aluguel de brinquedos infláveis, cama elástica, piscina de bolinhas e mesas de jogos em Canoas, Esteio, Sapucaia do Sul, Nova Santa Rita e Cachoeirinha. Escolha a data, monte a sacolinha e finalize pelo WhatsApp.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a2f9e",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Nunito:wght@500;600;700;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
