import type { Metadata } from 'next';
import { FieldGuide } from './field-guide';

export const metadata: Metadata = {
  title: 'Under the characters — ASCII City',
  description: 'An interactive field guide to the world, cameras, rays and characters behind ASCII City.',
};

export default function HowItWorks() { return <FieldGuide />; }
