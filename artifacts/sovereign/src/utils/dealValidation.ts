export function validateDealCard(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required fields validation
  if (!data.companyName || data.companyName.trim().length < 2) {
    errors.push('يجب أن يحتوي اسم الشركة على حرفين على الأقل');
  }

  if (!data.websiteUrl || data.websiteUrl.trim() === '') {
    errors.push('رابط الموقع مطلوب');
  } else {
    try {
      new URL(data.websiteUrl.trim());
    } catch {
      errors.push('رابط الموقع غير صالح');
    }
  }

  if (!data.budgetRange || data.budgetRange.trim() === '') {
    errors.push('نطاق الميزانية مطلوب');
  } else if (!/\d/.test(data.budgetRange)) {
    errors.push('يجب أن يحتوي نطاق الميزانية على رقم واحد على الأقل');
  }

  if (!data.campaignDescription || data.campaignDescription.trim().length < 20) {
    errors.push('وصف الحملة يجب أن يحتوي على 20 حرفاً على الأقل');
  } else if (data.campaignDescription.trim().length > 2000) {
    errors.push('وصف الحملة يجب ألا يتجاوز 2000 حرف');
  }

  if (!data.dealType || data.dealType.trim() === '') {
    errors.push('نوع الصفقة مطلوب');
  }

  if (!data.timeline || data.timeline.trim() === '') {
    errors.push('الجدول الزمني مطلوب');
  }

  // Optional fields validation
  if (data.deliverables && data.deliverables.trim().length > 1000) {
    errors.push('اللحظات يجب ألا تتجاوز 1000 حرف');
  }

  if (data.whyThem) {
    const whyThemTrimmed = data.whyThem.trim();
    if (whyThemTrimmed.length > 0 && whyThemTrimmed.length < 10) {
      errors.push('حقل "لماذا هم؟" يجب أن يحتوي على 10 أحرف على الأقل إذا تم ملؤه');
    }
    if (whyThemTrimmed.length > 500) {
      errors.push('حقل "لماذا هم؟" يجب ألا يتجاوز 500 حرف');
    }
  }

  if (data.pitch) {
    const pitchTrimmed = data.pitch.trim();
    if (pitchTrimmed.length > 0 && pitchTrimmed.length < 10) {
      errors.push('حقل "Pitch" يجب أن يحتوي على 10 أحرف على الأقل إذا تم ملؤه');
    }
    if (pitchTrimmed.length > 300) {
      errors.push('حقل "Pitch" يجب ألا يتجاوز 300 حرف');
    }
  }

  // Spam detection
  const textParts = [
    data.campaignDescription || '',
    data.pitch || '',
    data.whyThem || '',
    data.deliverables || '',
  ];
  const fullText = textParts.join(' ').toLowerCase();

  // Block list (Arabic/English)
  const blockedWords = [
    'ربح سريع',
    'زيارة موقعي',
    'فرصة ذهبية',
    'كسب',
    'تسويق',
    'إعلان',
    'free money',
    'guaranteed',
    'click here',
    'special offer',
    'شراء متابعين',
    'بيع حسابات',
  ];

  for (const word of blockedWords) {
    if (fullText.includes(word.toLowerCase())) {
      errors.push('يبدو أن المحتوى يحتوي على لغة غير لائقة. يرجى مراجعته');
      break;
    }
  }

  // Check for 3+ consecutive ! or ?
  if (/[!?]{3,}/.test(fullText)) {
    errors.push('الرجاء تجنب استخدام علامات الترقيم المتكررة');
  }

  // Check for > 50% uppercase (excluding numbers/punctuation)
  const lettersOnly = fullText.replace(/[^a-zA-Z\u0600-\u06FF]/g, '');
  if (lettersOnly.length > 0) {
    const uppercaseCount = (lettersOnly.match(/[A-Z\u0600-\u06FF]/g) || []).length;
    // Note: Arabic doesn't have uppercase, so we only count Latin uppercase
    const latinLetters = fullText.replace(/[^a-zA-Z]/g, '');
    if (latinLetters.length > 0) {
      const latinUppercase = (latinLetters.match(/[A-Z]/g) || []).length;
      if (latinUppercase / latinLetters.length > 0.5) {
        errors.push('الرجاء تجنب الكتابة بأحرف كبيرة مفرطة');
      }
    }
  }

  // Check for short links
  const shortLinkPatterns = [
    /bit\.ly/i,
    /tinyurl/i,
    /goo\.gl/i,
    /rb\.gy/i,
    /short\.link/i,
  ];

  for (const pattern of shortLinkPatterns) {
    if (pattern.test(fullText)) {
      errors.push('الرجاء عدم استخدام روابط مختصرة');
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
