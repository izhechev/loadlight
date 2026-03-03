import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Category {
  id: string
  name: string
  emoji: string
  color: string // tailwind color key, e.g. 'blue', 'emerald', 'pink'
}

export const COLOR_OPTIONS = [
  { key: 'blue',    bg: 'bg-blue-500/20',    text: 'text-blue-100',    dot: 'bg-blue-400' },
  { key: 'indigo',  bg: 'bg-indigo-500/20',  text: 'text-indigo-100',  dot: 'bg-indigo-400' },
  { key: 'teal',    bg: 'bg-teal-500/20',    text: 'text-teal-100',    dot: 'bg-teal-400' },
  { key: 'emerald', bg: 'bg-emerald-500/20', text: 'text-emerald-100', dot: 'bg-emerald-400' },
  { key: 'pink',    bg: 'bg-pink-500/20',    text: 'text-pink-100',    dot: 'bg-pink-400' },
  { key: 'amber',   bg: 'bg-amber-500/20',   text: 'text-amber-100',   dot: 'bg-amber-400' },
  { key: 'purple',  bg: 'bg-purple-500/20',  text: 'text-purple-100',  dot: 'bg-purple-400' },
  { key: 'rose',    bg: 'bg-rose-500/20',    text: 'text-rose-100',    dot: 'bg-rose-400' },
  { key: 'sky',     bg: 'bg-sky-500/20',     text: 'text-sky-100',     dot: 'bg-sky-400' },
  { key: 'orange',  bg: 'bg-orange-500/20',  text: 'text-orange-100',  dot: 'bg-orange-400' },
] as const

export type ColorKey = typeof COLOR_OPTIONS[number]['key']

export function getCategoryClasses(color: string): { bg: string; text: string; dot: string } {
  return COLOR_OPTIONS.find(c => c.key === color) ?? COLOR_OPTIONS[0]
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'work',     name: 'Work',     emoji: '💼', color: 'blue' },
  { id: 'study',    name: 'Study',    emoji: '📚', color: 'indigo' },
  { id: 'personal', name: 'Personal', emoji: '🏠', color: 'teal' },
  { id: 'exercise', name: 'Exercise', emoji: '🏃', color: 'emerald' },
  { id: 'creative', name: 'Creative', emoji: '🎨', color: 'pink' },
  { id: 'admin',    name: 'Admin',    emoji: '📋', color: 'amber' },
]

interface CategoryStore {
  categories: Category[]
  addCategory: (cat: Omit<Category, 'id'>) => void
  updateCategory: (id: string, updates: Partial<Omit<Category, 'id'>>) => void
  deleteCategory: (id: string) => void
  resetToDefaults: () => void
}

export const useCategoryStore = create<CategoryStore>()(
  persist(
    (set, get) => ({
      categories: DEFAULT_CATEGORIES,

      addCategory(cat) {
        set(s => ({
          categories: [...s.categories, { ...cat, id: Math.random().toString(36).slice(2) }],
        }))
      },

      updateCategory(id, updates) {
        set(s => ({
          categories: s.categories.map(c => c.id === id ? { ...c, ...updates } : c),
        }))
      },

      deleteCategory(id) {
        set(s => ({ categories: s.categories.filter(c => c.id !== id) }))
      },

      resetToDefaults() {
        set({ categories: DEFAULT_CATEGORIES })
      },
    }),
    { 
      name: 'loadlight-categories',
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Migration: Ensure Exercise category exists
          const hasExercise = state.categories.some(c => c.name.toLowerCase() === 'exercise')
          if (!hasExercise) {
            state.addCategory({ name: 'Exercise', emoji: '🏃', color: 'emerald' })
          }
        }
      }
    }
  )
)
