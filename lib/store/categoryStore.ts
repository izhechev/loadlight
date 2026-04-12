import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Category {
  id: string
  name: string
  emoji: string
  color: string // tailwind color key, e.g. 'blue', 'emerald', 'pink'
}

export const COLOR_OPTIONS = [
  { key: 'blue',    bg: 'bg-blue-100/90',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  { key: 'indigo',  bg: 'bg-indigo-100/90',  text: 'text-indigo-700',  dot: 'bg-indigo-500' },
  { key: 'teal',    bg: 'bg-teal-100/90',    text: 'text-teal-700',    dot: 'bg-teal-500' },
  { key: 'emerald', bg: 'bg-emerald-100/90', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  { key: 'pink',    bg: 'bg-pink-100/90',    text: 'text-pink-700',    dot: 'bg-pink-500' },
  { key: 'amber',   bg: 'bg-amber-100/90',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  { key: 'purple',  bg: 'bg-purple-100/90',  text: 'text-purple-700',  dot: 'bg-purple-500' },
  { key: 'rose',    bg: 'bg-rose-100/90',    text: 'text-rose-700',    dot: 'bg-rose-500' },
  { key: 'sky',     bg: 'bg-sky-100/90',     text: 'text-sky-700',     dot: 'bg-sky-500' },
  { key: 'orange',  bg: 'bg-orange-100/90',  text: 'text-orange-700',  dot: 'bg-orange-500' },
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
  reorderCategories: (fromId: string, toId: string) => void
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

      reorderCategories(fromId, toId) {
        set(s => {
          const cats = [...s.categories]
          const fromIdx = cats.findIndex(c => c.id === fromId)
          const toIdx = cats.findIndex(c => c.id === toId)
          if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return s
          const [moved] = cats.splice(fromIdx, 1)
          cats.splice(toIdx, 0, moved)
          return { categories: cats }
        })
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
