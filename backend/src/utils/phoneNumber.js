'use strict';

/**
 * Format nomor HP ke format WhatsApp ID.
 *
 * Input  : "081234567890" | "+6281234567890" | "6281234567890" | "6281234567890@c.us"
 * Output : "6281234567890@c.us"
 */
const formatPhoneNumber = (phone) => {
  // Hilangkan suffix @c.us jika sudah ada
  let cleaned = phone.replace(/@c\.us$/, '');

  // Hapus semua karakter non-digit (+, -, spasi, dll.)
  cleaned = cleaned.replace(/\D/g, '');

  // Konversi nomor lokal (awalan 0) ke format internasional Indonesia
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }

  return `${cleaned}@c.us`;
};

/**
 * Validasi apakah nomor HP memiliki panjang yang reasonable.
 * (10–15 digit setelah dibersihkan)
 */
const isValidPhoneNumber = (phone) => {
  const cleaned = phone.replace(/\D/g, '').replace(/@c\.us$/, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
};

module.exports = { formatPhoneNumber, isValidPhoneNumber };
