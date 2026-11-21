import {
  Accessibility, Baby, Bus, Cake, Calendar, Camera, Car, Check, Clock, Coffee, Crown, Flame, Gem, Gift, Heart, Info, Mail,
  MapPin, Moon, Music, ParkingCircle, Phone, Shirt, Sparkles, Star, Sun, Ticket, Users, Utensils, X,
  type LucideIcon,
} from "lucide-react";
import type { SITE_ICONS } from "@/modules/ticketing/schemas";

/** Bibliothèque fermée de pictogrammes (`SITE_ICONS`) : jamais un nom d'icône libre. */
const ICONS: Record<(typeof SITE_ICONS)[number], LucideIcon> = {
  shirt: Shirt, gem: Gem, users: Users, camera: Camera, check: Check, x: X, star: Star, heart: Heart, music: Music, utensils: Utensils,
  coffee: Coffee, cake: Cake, gift: Gift, calendar: Calendar, clock: Clock, "map-pin": MapPin, car: Car, bus: Bus, "parking-circle": ParkingCircle,
  accessibility: Accessibility, baby: Baby, ticket: Ticket, phone: Phone, mail: Mail, info: Info, sparkles: Sparkles, sun: Sun, moon: Moon, flame: Flame, crown: Crown,
};

export default function SiteIcon({ name, className = "size-5" }: { readonly name: (typeof SITE_ICONS)[number]; readonly className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden="true" />;
}
