import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "余烬协议｜双人肉鸽生存游戏",
  description: "守住最后一簇不肯熄灭的火。可单人游玩、支持点对点联机的俯视角肉鸽生存游戏。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "余烬协议",
    description: "守住最后一簇不肯熄灭的火。双人肉鸽生存实验。",
    type: "website",
    images: [{ url: "/og.png", width: 1732, height: 908, alt: "余烬协议游戏封面" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "余烬协议",
    description: "双人肉鸽生存实验",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
