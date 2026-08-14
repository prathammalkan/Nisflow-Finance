import { formatINR } from "@/lib/finance/money";

export interface ReminderData {
  personName: string;
  phone?: string;
  amount: number;
  reason: string;
  dueDate?: string;
  upiId?: string;
}

export function buildWhatsAppMessage(data: ReminderData): string {
  const formattedAmount = formatINR(data.amount);
  const formattedDate = data.dueDate ? new Date(data.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  
  let msg = `Hi ${data.personName},\n\n`;
  msg += `A gentle reminder regarding payment of *${formattedAmount}* for *"${data.reason}"*`;
  if (formattedDate) {
    msg += ` (due on ${formattedDate})`;
  }
  msg += `.\n\n`;
  
  if (data.upiId) {
    msg += `You can pay via UPI to: *${data.upiId}*\n\n`;
  }
  
  msg += `Thank you! (Sent via NisFlow Finance)`;
  return msg;
}

export function openWhatsAppReminder(data: ReminderData) {
  const text = encodeURIComponent(buildWhatsAppMessage(data));
  const cleanPhone = data.phone ? data.phone.replace(/[^0-9]/g, '') : '';
  
  const url = cleanPhone 
    ? `https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}?text=${text}`
    : `https://wa.me/?text=${text}`;
    
  window.open(url, '_blank');
}

export function openSMSReminder(data: ReminderData) {
  const formattedAmount = formatINR(data.amount);
  const text = encodeURIComponent(`Hi ${data.personName}, reminder for payment of ${formattedAmount} for "${data.reason}". Thank you.`);
  const cleanPhone = data.phone ? data.phone.replace(/[^0-9]/g, '') : '';
  
  const url = cleanPhone ? `sms:${cleanPhone}?body=${text}` : `sms:?body=${text}`;
  window.open(url, '_self');
}
