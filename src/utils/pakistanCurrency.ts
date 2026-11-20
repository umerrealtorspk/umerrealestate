import { PropertyListing } from '../types/inventory';

/**
 * Formats a numeric price in Lakhs to Pakistani currency notation (Lakh / Crore)
 */
export function formatLakhs(lakhs: number): string {
  if (lakhs === 0 || !lakhs) return 'Demand on Call';
  if (lakhs >= 100) {
    const crore = (lakhs / 100).toFixed(2).replace(/\.00$/, '');
    return `${crore} Crore`;
  }
  return `${lakhs.toLocaleString()} Lakh`;
}

/**
 * Formats full PKR currency with Rs. prefix
 */
export function formatFullPKR(lakhs: number): string {
  const pkr = lakhs * 100000;
  return `PKR ${pkr.toLocaleString()}`;
}

/**
 * Calculates demand rate per Marla in Lakhs
 */
export function calculateRatePerMarla(priceInLakhs: number, marlaSize: number): string {
  if (!marlaSize || marlaSize <= 0) return '-';
  const rate = priceInLakhs / marlaSize;
  return `${rate.toFixed(1)} Lac / Marla`;
}

/**
 * Cleans and standardizes Pakistani phone numbers for tel: and WhatsApp
 * e.g., '0300-1234567' -> '923001234567'
 */
export function cleanPakistaniPhone(phone: string): string {
  if (!phone || phone.trim() === '-' || phone.trim() === 'N/A') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return '';
  if (digits.startsWith('92')) {
    return digits;
  }
  if (digits.startsWith('03')) {
    return `92${digits.slice(1)}`;
  }
  if (digits.startsWith('3') && digits.length === 10) {
    return `92${digits}`;
  }
  return digits;
}

/**
 * Generates an instant WhatsApp chat link with pre-filled message
 */
export function generateWhatsAppLink(property: PropertyListing): string {
  const cleanPhone = cleanPakistaniPhone(property.contactNumber);
  if (!cleanPhone || cleanPhone.length < 10) {
    return '#';
  }
  const text = `Assalam-o-Alaikum!
I am inquiring about your listing in *${property.society}*:

📍 *${property.category} # ${property.unitNumber}*
🏙️ *Block/Sector:* ${property.block}
📐 *Size:* ${property.sizeLabel}
💰 *Demand:* ${formatLakhs(property.priceInLakhs)}
🏷️ *Tags:* ${property.features?.join(', ') || 'Solid'}

Is this property still available for visit/dealing? Please confirm.
— *Umer Realtors Lahore*`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * Generates client-ready text formatted cleanly for forwarding to buyer clients
 */
export function generateClientShareText(property: PropertyListing, agentName = 'Umer Realtors - Lahore'): string {
  return `*AVAILABLE FOR SALE IN LAHORE* 🌟

🏙️ *Society:* ${property.society}
📍 *Block/Phase:* ${property.block}
🔢 *Unit/Plot #:* ${property.unitNumber}
🏡 *Type:* ${property.category}
📏 *Area:* ${property.sizeLabel}
💵 *Demand:* ${formatLakhs(property.priceInLakhs)}
✨ *Highlights:* ${property.features.join(' | ')}
${property.notes ? `📝 *Details:* ${property.notes}\n` : ''}
Direct deal with owner possible. Ideal for immediate construction and long-term investment!

📞 *For Site Visit & Booking:*
*${agentName}*
Call/WhatsApp: Direct Inquiry Available`;
}
