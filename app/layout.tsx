import type { Metadata } from "next";
import type { StaticImageData } from "next/image";
import faviconAsset from "@/games/ember-protocol/assets/favicon.svg";
import ogAsset from "@/games/ember-protocol/assets/og.png";
import "./globals.css";

const assetUrl = (asset: StaticImageData | string) => typeof asset === "string" ? asset : asset.src;
const faviconUrl = assetUrl(faviconAsset);
const ogUrl = assetUrl(ogAsset);

export const metadata: Metadata = {
  metadataBase: new URL("https://panxie45-coder.github.io"),
  title: "余烬协议｜双人肉鸽生存游戏",
  description: "守住最后一簇不肯熄灭的火。可单人游玩、支持点对点联机的俯视角肉鸽生存游戏。",
  icons: { icon: faviconUrl, shortcut: faviconUrl },
  openGraph: {
    title: "余烬协议",
    description: "守住最后一簇不肯熄灭的火。双人肉鸽生存实验。",
    type: "website",
    images: [{ url: ogUrl, width: 1732, height: 908, alt: "余烬协议游戏封面" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "余烬协议",
    description: "双人肉鸽生存实验",
    images: [ogUrl],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
