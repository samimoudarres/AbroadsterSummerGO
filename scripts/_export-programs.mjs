import fs from 'node:fs';

const src = fs.readFileSync('data/studyAbroadPrograms.ts', 'utf8');
const m = src.match(/export const STUDY_ABROAD_PROGRAMS[^=]*=\s*(\[[\s\S]*\]);/);
if (!m) {
  console.error('Could not find STUDY_ABROAD_PROGRAMS array');
  process.exit(1);
}
const programs = Function(`return (${m[1]})`)();
fs.writeFileSync('data/studyAbroadPrograms.json', JSON.stringify(programs, null, 2));
console.log('wrote', programs.length, 'programs');
