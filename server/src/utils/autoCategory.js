// server/src/utils/autoCategory.js
function autoCategory(text) {
  const t = (text || '').toLowerCase();
  const rules = [
    { cat: 'Roads', keys: ['road', 'গর্ত', 'রাস্তা', 'pothole', 'bridge'] },
    { cat: 'Waste', keys: ['garbage', 'waste', 'ময়লা', 'dustbin', 'collection'] },
    { cat: 'Flooding', keys: ['waterlogging', 'flood', 'জলাবদ্ধতা', 'drain'] },
    { cat: 'Health', keys: ['clinic', 'hospital', 'doctor', 'health', 'ভ্যাকসিন'] },
    { cat: 'Education', keys: ['school', 'college', 'education', 'বিদ্যালয়'] }
  ];
  for (const r of rules) {
    if (r.keys.some(k => t.includes(k))) return r.cat;
  }
  return 'General';
}
module.exports = { autoCategory };
