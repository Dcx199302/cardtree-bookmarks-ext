
export interface BackgroundOption {
  id: string;
  title: string;
  description: string;
  image?: string;
}

export const DEFAULT_BACKGROUND_ID = 'default';

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: DEFAULT_BACKGROUND_ID, title: '默认渐变', description: '轻量、随主题变化的原版背景' },
  { id: 'lake', title: '湖光山色', description: '清透湖泊与远山', image: './backgrounds/lake.jpg' },
  { id: 'ocean', title: '晨海微光', description: '柔和海岸与天空', image: './backgrounds/ocean.jpg' },
  { id: 'forest', title: '林间晨雾', description: '安静的自然氛围', image: './backgrounds/forest.jpg' },
  { id: 'mountains', title: '雪山夜色', description: '低饱和山野夜景', image: './backgrounds/mountains.jpg' },
  { id: 'alpine', title: '高山湖泊', description: '开阔通透的自然光', image: './backgrounds/alpine.jpg' },
  { id: 'canopy', title: '翠绿林荫', description: '高饱和绿色层次', image: './backgrounds/canopy.jpg' },
];

export function getBackgroundOption(id: string): BackgroundOption | undefined {
  return BACKGROUND_OPTIONS.find(option => option.id === id);
}
