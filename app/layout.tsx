import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'ASCII City — Nine neighborhoods',description:'Explore nine connected ASCII neighborhoods, from a market and park to a construction site, in three camera views.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}
