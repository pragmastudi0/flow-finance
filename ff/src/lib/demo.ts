function ns(email: string): string {
  const safe = email.replace(/[^a-zA-Z0-9@._-]/g, '_');
  return `ff:${safe}`;
}

function store<T>(key: string) {
  function read(): (T & { id: string })[] {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { return []; }
  }
  function write(data: (T & { id: string })[]) {
    localStorage.setItem(key, JSON.stringify(data));
  }
  return {
    getAll: () => read(),
    getById: (id: string) => read().find(i => i.id === id),
    insert: (item: T & { id?: string }) => {
      const all = read();
      const newItem = { ...item, id: item.id || crypto.randomUUID() } as T & { id: string };
      all.unshift(newItem);
      write(all);
      return newItem;
    },
    update: (id: string, data: Partial<T>) => {
      const all = read();
      const idx = all.findIndex(i => i.id === id);
      if (idx !== -1) { all[idx] = { ...all[idx], ...data }; write(all); }
    },
    remove: (id: string) => write(read().filter(i => i.id !== id)),
    clear: () => localStorage.removeItem(key),
  };
}

interface DemoUser {
  email: string;
  password: string;
  name: string;
  createdAt: string;
}

export function registerUser(email: string, password: string, name?: string): void {
  const users = JSON.parse(localStorage.getItem('ff:users') || '[]') as DemoUser[];
  if (users.some(u => u.email === email)) throw new Error('Ese email ya está registrado');
  users.push({ email, password, name: name || email.split('@')[0], createdAt: new Date().toISOString() });
  localStorage.setItem('ff:users', JSON.stringify(users));
  setSession(email);
}

export function loginUser(email: string, password: string): void {
  const users = JSON.parse(localStorage.getItem('ff:users') || '[]') as DemoUser[];
  const user = users.find(u => u.email === email);
  if (!user) throw new Error('Usuario no encontrado');
  if (user.password !== password) throw new Error('Contraseña incorrecta');
  setSession(email);
}

export function logoutUser(): void {
  localStorage.removeItem('ff:session');
}

export function getSessionEmail(): string | null {
  return localStorage.getItem('ff:session');
}

export function isLoggedIn(): boolean {
  return !!getSessionEmail();
}

function setSession(email: string): void {
  localStorage.setItem('ff:session', email);
}

function currentNS(): string {
  const email = getSessionEmail();
  if (!email) throw new Error('No hay sesión activa');
  return ns(email);
}

export const demoTransactions = {
  getAll: () => store<any>(`${currentNS()}:transactions`).getAll(),
  getById: (id: string) => store<any>(`${currentNS()}:transactions`).getById(id),
  insert: (item: any) => store<any>(`${currentNS()}:transactions`).insert(item),
  update: (id: string, data: any) => store<any>(`${currentNS()}:transactions`).update(id, data),
  remove: (id: string) => store<any>(`${currentNS()}:transactions`).remove(id),
};

export const demoGoals = {
  getAll: () => store<any>(`${currentNS()}:goals`).getAll(),
  getById: (id: string) => store<any>(`${currentNS()}:goals`).getById(id),
  insert: (item: any) => store<any>(`${currentNS()}:goals`).insert(item),
  update: (id: string, data: any) => store<any>(`${currentNS()}:goals`).update(id, data),
  remove: (id: string) => store<any>(`${currentNS()}:goals`).remove(id),
};

export const demoContributions = {
  getAll: () => store<any>(`${currentNS()}:contributions`).getAll(),
  insert: (item: any) => store<any>(`${currentNS()}:contributions`).insert(item),
};

export const demoFixedExpenses = {
  getAll: () => store<any>(`${currentNS()}:fixed_expenses`).getAll(),
  getById: (id: string) => store<any>(`${currentNS()}:fixed_expenses`).getById(id),
  insert: (item: any) => store<any>(`${currentNS()}:fixed_expenses`).insert(item),
  update: (id: string, data: any) => store<any>(`${currentNS()}:fixed_expenses`).update(id, data),
  remove: (id: string) => store<any>(`${currentNS()}:fixed_expenses`).remove(id),
};

export const demoCategories = {
  getAll: () => store<any>(`${currentNS()}:categories`).getAll(),
  insert: (item: any) => store<any>(`${currentNS()}:categories`).insert(item),
  remove: (id: string) => store<any>(`${currentNS()}:categories`).remove(id),
};

export const demoLearnings = {
  getAll: () => store<any>(`${currentNS()}:learnings`).getAll(),
  insert: (item: any) => store<any>(`${currentNS()}:learnings`).insert(item),
};

export function getDemoUser() {
  const email = getSessionEmail();
  if (!email) return null;
  return {
    id: email,
    email,
    aud: 'authenticated',
    role: 'authenticated',
  };
}

export function seedDemoData() {
  const existing = demoTransactions.getAll();
  if (existing.length > 0) return;

  const today = new Date();
  const yyyymmdd = (d: Date) => d.toISOString().split('T')[0];
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today); lastWeek.setDate(lastWeek.getDate() - 5);

  demoTransactions.insert({ type: 'expense', amount: 4500, currency: 'ARS', fxRate: 1, category: 'food', description: 'Almuerzo con equipo', occurredOn: yyyymmdd(today), rawInput: '4500 almuerzo', createdAt: new Date().toISOString() });
  demoTransactions.insert({ type: 'expense', amount: 3200, currency: 'ARS', fxRate: 1, category: 'transport', description: 'Uber al trabajo', occurredOn: yyyymmdd(today), rawInput: '3200 uber', createdAt: new Date().toISOString() });
  demoTransactions.insert({ type: 'expense', amount: 12500, currency: 'ARS', fxRate: 1, category: 'groceries', description: 'Coto', occurredOn: yyyymmdd(yesterday), rawInput: '12500 coto', createdAt: new Date().toISOString() });
  demoTransactions.insert({ type: 'income', amount: 500000, currency: 'ARS', fxRate: 1, category: 'salary', description: 'Salario mensual', occurredOn: yyyymmdd(lastWeek), rawInput: '500000 salario', createdAt: new Date().toISOString() });
  demoTransactions.insert({ type: 'expense', amount: 15000, currency: 'ARS', fxRate: 1, category: 'bills', description: 'Edenor', occurredOn: yyyymmdd(lastWeek), rawInput: '15000 edenor', createdAt: new Date().toISOString() });
  demoTransactions.insert({ type: 'expense', amount: 8900, currency: 'ARS', fxRate: 1, category: 'entertainment', description: 'Netflix + Spotify', occurredOn: yyyymmdd(lastWeek), rawInput: '8900 netflix', createdAt: new Date().toISOString() });

  demoGoals.insert({ description: 'Viaje a Japón', goalAmount: 3000000, targetDate: '2027-06-01', status: 'active', currentSavedAmount: 450000, remainingAmount: 2550000, progressPct: 15 });
  demoGoals.insert({ description: 'Fondo de emergencia', goalAmount: 1000000, targetDate: '2026-12-01', status: 'active', currentSavedAmount: 600000, remainingAmount: 400000, progressPct: 60 });

  demoFixedExpenses.insert({ description: 'Alquiler', amount: 85000, currency: 'ARS', category: 'bills', recurrence: 'subscription', startDate: '2024-01-01', status: 'active' });
  demoFixedExpenses.insert({ description: 'Netflix', amount: 5900, currency: 'ARS', category: 'entertainment', recurrence: 'subscription', startDate: '2024-01-01', status: 'active' });
  demoFixedExpenses.insert({ description: 'Notebook cuota 6/12', amount: 12500, currency: 'ARS', category: 'shopping', recurrence: 'installments', installments: 12, remainingInstallments: 6, startDate: '2025-07-01', status: 'active' });
}
