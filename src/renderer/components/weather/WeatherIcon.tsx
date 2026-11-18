import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { describeWeather } from '@shared/weather';

const ICONS: Record<string, LucideIcon> = {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
};

export function WeatherIcon({
  code,
  isDay = true,
  size = 16,
  className = '',
}: {
  code: number;
  isDay?: boolean;
  size?: number;
  className?: string;
}) {
  const I = ICONS[describeWeather(code, isDay).icon] ?? Cloud;
  return <I size={size} strokeWidth={1.4} className={className} aria-hidden />;
}
