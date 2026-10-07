import { importSummary } from './importSummary'

describe('importSummary', () => {
  it.each([
    [{ created: 2, updated: 1 }, "2 ta firma qo'shildi, 1 ta firma yangilandi"],
    [{ created: 0, updated: 2 }, '2 ta firma yangilandi'],
    [{ created: 3, updated: 0 }, "3 ta firma qo'shildi"],
    [{ created: 0, updated: 0 }, "Hech narsa o'zgarmadi"],
  ])('%j → %s', (counts, text) => {
    expect(importSummary(counts)).toBe(text)
  })
})
