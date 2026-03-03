"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Plus, Trash2, Tag, RefreshCw, Palette } from "lucide-react"
import { AppLayout } from "@/components/app-layout"
import { useCategoryStore, COLOR_OPTIONS, type ColorKey } from "@/lib/store/categoryStore"

export default function CategoriesPage() {
  const { categories, addCategory, deleteCategory, resetToDefaults } = useCategoryStore()
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [newEmoji, setNewEmoji] = useState("✨")
  const [newColor, setNewColor] = useState<ColorKey>('blue')

  function handleAdd() {
    if (!newName.trim()) return
    addCategory({ name: newName.trim(), emoji: newEmoji, color: newColor })
    setNewName("")
    setNewEmoji("✨")
    setNewColor('blue')
    setIsAdding(false)
  }

  return (
    <AppLayout>
      <div className="max-w-xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Categories</h1>
            <p className="text-sm text-slate-500 font-bold">Manage tags for your tasks. The AI will use these.</p>
          </div>
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="glow-button text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Category
          </button>
        </div>

        {isAdding && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="skeu-card p-5">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Tag className="w-4 h-4 text-sky-500" /> New Category
            </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-[3rem_1fr] gap-3">
                <input
                  type="text"
                  value={newEmoji}
                  onChange={e => setNewEmoji(e.target.value)}
                  maxLength={2}
                  className="input-skeu text-center text-xl p-2 rounded-xl border border-white/60 focus:outline-none focus:ring-2 focus:ring-sky-400"
                  placeholder="✨"
                />
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="input-skeu w-full p-3 rounded-xl border border-white/60 focus:outline-none focus:ring-2 focus:ring-sky-400 text-sm font-semibold"
                  placeholder="Category Name (e.g. Fitness, Chores)"
                  autoFocus
                />
              </div>
              
              <div>
                <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5"><Palette className="w-3 h-3" /> Select Color</p>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setNewColor(opt.key)}
                      className={`w-8 h-8 rounded-full ${opt.dot} border-2 transition-all ${newColor === opt.key ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent opacity-70 hover:opacity-100'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button 
                  onClick={() => setIsAdding(false)}
                  className="text-slate-500 font-bold px-4 py-2 hover:bg-white/40 rounded-xl transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAdd}
                  disabled={!newName.trim()}
                  className="glow-button text-white font-bold px-6 py-2 rounded-xl text-sm disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        )}

        <div className="space-y-3">
          {categories.map((cat, i) => {
            const colorData = COLOR_OPTIONS.find(c => c.key === cat.color) || COLOR_OPTIONS[0]
            return (
              <motion.div 
                key={cat.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`flex items-center justify-between p-4 rounded-2xl border bg-white/60 shadow-inner-sm ${colorData.bg.replace('bg-', 'border-')}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${colorData.bg} flex items-center justify-center text-lg border border-white/50 shadow-inner`}>
                    {cat.emoji}
                  </div>
                  <span className={`font-black ${colorData.text}`}>{cat.name}</span>
                </div>
                
                <button 
                  onClick={() => deleteCategory(cat.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            )
          })}
        </div>

        <div className="pt-8 flex justify-center">
          <button 
            onClick={() => {
              if (confirm('Are you sure you want to reset all categories to defaults?')) {
                resetToDefaults()
              }
            }}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600 font-bold transition-colors bg-white/40 px-4 py-2 rounded-full border border-white/60 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset to Default Categories
          </button>
        </div>
      </div>
    </AppLayout>
  )
}