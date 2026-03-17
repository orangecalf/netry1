/**
 * Simple vCard 3.0 parser and generator
 * Handles .vcf files for contact import/export
 */

function parseVCards(content) {
  const cards = [];
  const vcardBlocks = content.split(/BEGIN:VCARD/i).filter(b => b.trim());

  for (const block of vcardBlocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const card = {
      firstName: '',
      lastName: '',
      phone: null,
      workEmail: null,
      personalEmail: null,
      company: null,
    };

    for (const line of lines) {
      if (line.startsWith('END:VCARD')) continue;

      // Name: N:LastName;FirstName;Additional;Prefix;Suffix
      if (line.match(/^N[;:]/i)) {
        const val = line.replace(/^N[^:]*:/i, '');
        const parts = val.split(';');
        card.lastName = (parts[0] || '').trim();
        card.firstName = (parts[1] || '').trim();
        // Fallback if reversed
        if (!card.firstName && card.lastName) {
          card.firstName = card.lastName;
          card.lastName = '';
        }
        continue;
      }

      // Full name: FN:John Doe
      if (line.match(/^FN[;:]/i) && !card.firstName) {
        const val = line.replace(/^FN[^:]*:/i, '').trim();
        const parts = val.split(' ');
        card.firstName = parts[0] || '';
        card.lastName = parts.slice(1).join(' ') || '';
        continue;
      }

      // Phone: TEL;TYPE=CELL:+1234567890
      if (line.match(/^TEL[;:]/i) && !card.phone) {
        card.phone = line.replace(/^TEL[^:]*:/i, '').trim();
        continue;
      }

      // Email: EMAIL;TYPE=WORK:foo@bar.com or EMAIL;TYPE=HOME:...
      if (line.match(/^EMAIL[;:]/i)) {
        const typeMatch = line.match(/TYPE=([^;:]+)/i);
        const emailVal = line.replace(/^EMAIL[^:]*:/i, '').trim();
        const type = typeMatch ? typeMatch[1].toUpperCase() : '';

        if (type.includes('WORK') && !card.workEmail) {
          card.workEmail = emailVal;
        } else if ((type.includes('HOME') || type.includes('PERSONAL') || !type) && !card.personalEmail) {
          card.personalEmail = emailVal;
        } else if (!card.workEmail) {
          card.workEmail = emailVal;
        }
        continue;
      }

      // Organization
      if (line.match(/^ORG[;:]/i) && !card.company) {
        card.company = line.replace(/^ORG[^:]*:/i, '').split(';')[0].trim();
        continue;
      }
    }

    if (card.firstName || card.lastName) {
      cards.push(card);
    }
  }

  return cards;
}

function escapeVCardValue(val) {
  if (!val) return '';
  return val.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function contactsToVCard(contacts) {
  const parts = contacts.map(c => {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
    const fn = [c.first_name, c.last_name].filter(Boolean).join(' ');
    lines.push(`FN:${escapeVCardValue(fn)}`);
    lines.push(`N:${escapeVCardValue(c.last_name || '')};${escapeVCardValue(c.first_name || '')};;;`);
    if (c.phone) lines.push(`TEL;TYPE=CELL:${c.phone}`);
    if (c.work_email) lines.push(`EMAIL;TYPE=WORK:${c.work_email}`);
    if (c.personal_email) lines.push(`EMAIL;TYPE=HOME:${c.personal_email}`);
    if (c.company) lines.push(`ORG:${escapeVCardValue(c.company)}`);
    if (c.notes) lines.push(`NOTE:${escapeVCardValue(c.notes)}`);
    lines.push('END:VCARD');
    return lines.join('\r\n');
  });

  return parts.join('\r\n\r\n');
}

module.exports = { parseVCards, contactsToVCard };
