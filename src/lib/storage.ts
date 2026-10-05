/** localStorage koji ne ruši aplikaciju kad je zabranjen (privatni prozor, blokirani podaci). */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* nije bitno */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch {
      /* nije bitno */
    }
  },
}
