export function suggestedSteps(name: string): string[] {
  if (/\b(essay|report|article|draft|paper|presentation)\b/i.test(name)) {
    return ['Outline the main points', 'Write the first draft', 'Review the draft and finish it']
  }
  if (/\b(study|revise|chapter|lecture|reading)\b/i.test(name)) {
    return ['Choose the sections to cover', 'Work through each section', 'Check what you remember']
  }
  return []
}
