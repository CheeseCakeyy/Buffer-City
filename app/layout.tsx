import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'ASCII City — The first block',description:'Walk through an isometric ASCII city and learn how its raycasting renderer works.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}
