export type Lang = 'en' | 'si';

/**
 * Minimal dictionary. Sinhala strings are a first draft and should be reviewed by a native
 * speaker before release. Missing keys fall back to English.
 */
const dictionary: Record<string, { en: string; si: string }> = {
  signIn: { en: 'Sign in', si: 'ඇතුල් වන්න' },
  signOut: { en: 'Sign out', si: 'පිටවන්න' },
  email: { en: 'Work email', si: 'වැඩ ඊමේල්' },
  password: { en: 'Password', si: 'මුරපදය' },
  welcomeBack: { en: 'Welcome back', si: 'නැවත සාදරයෙන් පිළිගනිමු' },
  signInSubtitle: { en: 'Sign in to continue to your workspace.', si: 'ඔබේ කාර්යාල පරිසරයට ඇතුල් වන්න.' },
  dashboard: { en: 'Dashboard', si: 'පුවරුව' },
  users: { en: 'Users', si: 'පරිශීලකයින්' },
  search: { en: 'Search', si: 'සොයන්න' },
  addUser: { en: 'Add user', si: 'පරිශීලකයා එක් කරන්න' },
  role: { en: 'Role', si: 'භූමිකාව' },
  status: { en: 'Status', si: 'තත්ත්වය' },
  active: { en: 'Active', si: 'සක්‍රියයි' },
  invited: { en: 'Invited', si: 'ආරාධනා කළා' },
  suspended: { en: 'Suspended', si: 'අත්හිටුවා ඇත' },
  deactivated: { en: 'Deactivated', si: 'අක්‍රිය කළා' },
  suspend: { en: 'Suspend', si: 'අත්හිටුවන්න' },
  reactivate: { en: 'Reactivate', si: 'නැවත සක්‍රිය කරන්න' },
  save: { en: 'Save changes', si: 'වෙනස්කම් සුරකින්න' },
  cancel: { en: 'Cancel', si: 'අවලංගු කරන්න' },
  comingSoon: { en: 'Coming in phase', si: 'ඉදිරි අදියරේදී' },
  language: { en: 'Language', si: 'භාෂාව' },
  theme: { en: 'Theme', si: 'තේමාව' },
  lightTheme: { en: 'Light', si: 'ආලෝක' },
  darkTheme: { en: 'Dark', si: 'අඳුරු' },
  systemTheme: { en: 'System', si: 'පද්ධතිය' },
  temporaryPassword: { en: 'Temporary password', si: 'තාවකාලික මුරපදය' },
  copy: { en: 'Copy', si: 'පිටපත් කරන්න' },
  copied: { en: 'Copied', si: 'පිටපත් විය' },
  mustChangePassword: { en: 'Change your temporary password to continue.', si: 'ඉදිරියට යාමට තාවකාලික මුරපදය වෙනස් කරන්න.' },
  newPassword: { en: 'New password', si: 'නව මුරපදය' },
  currentPassword: { en: 'Current password', si: 'වර්තමාන මුරපදය' },
  projects: { en: 'Projects', si: 'ව්‍යාපෘති' },
  tasks: { en: 'Tasks', si: 'කාර්යයන්' },
  sprints: { en: 'Sprints', si: 'ස්ප්‍රින්ට්' },
  clients: { en: 'Clients', si: 'සේවාලාභීන්' },
  bugs: { en: 'Bugs', si: 'දෝෂ' },
  documents: { en: 'Documents', si: 'ලේඛන' },
  'time-tracker': { en: 'Time tracker', si: 'කාල ලුහුබැඳීම' },
  attendance: { en: 'Attendance', si: 'පැමිණීම' },
  leave: { en: 'Leave', si: 'නිවාඩු' },
  interns: { en: 'Interns', si: 'අභ්‍යාසලාභීන්' },
  chat: { en: 'Team chat', si: 'කණ්ඩායම් කතාබස්' },
  meetings: { en: 'Meetings', si: 'රැස්වීම්' },
  reports: { en: 'Reports', si: 'වාර්තා' },
  'audit-logs': { en: 'Audit logs', si: 'විගණන ලොග්' },
  settings: { en: 'Settings', si: 'සැකසුම්' },
  overview: { en: 'Overview', si: 'දළ විශ්ලේෂණය' },
  roadmapNotice: { en: 'This module is part of a later release.', si: 'මෙම මොඩියුලය ඉදිරි නිකුතුවේ කොටසකි.' },
  loading: { en: 'Loading…', si: 'පූරණය වෙමින්…' },
};

export function translate(key: string, lang: Lang): string {
  const entry = dictionary[key];
  if (!entry) return key;
  return entry[lang] || entry.en;
}
