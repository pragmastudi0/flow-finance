export type TxType = 'expense' | 'income';

export const INCOME_CATEGORIES = [
  'salary',
  'freelance',
  'investment',
  'gift',
  'refund',
  'other_income',
] as const;

export const EXPENSE_CATEGORIES = [
  'food',
  'groceries',
  'transport',
  'shopping',
  'entertainment',
  'health',
  'bills',
  'education',
  'other',
] as const;

export const FALLBACK_CATEGORY: Record<TxType, string> = {
  expense: 'other',
  income: 'other_income',
};

/**
 * Lowercase and strip diacritics, so "café" and "cafe" are the same token.
 * Applied to both the text and the keyword before matching, which means the
 * lists below only need the unaccented spelling.
 */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Keyword dictionary used to guess a category from free text — a typed entry,
 * or the merchant name and line items read off a receipt.
 *
 * Two things drive the hit rate in practice:
 *   1. Merchant and brand names, the strongest signal on a receipt.
 *      The list leans Argentine because that is where the app is used.
 *   2. Everyday Spanish vocabulary. The original shipped English-only keywords
 *      while defaulting the UI to Spanish, so almost everything fell through
 *      to `other`.
 *
 * Write keywords unaccented and lowercase. Matching is word-anchored with an
 * optional plural suffix (see `matchesKeyword`), so "cafe" matches "cafes" and
 * "café", but "pan" does not match "pantalon".
 *
 * A keyword should appear in exactly one expense category. Duplicates cancel
 * each other out in the scoring; `findDuplicateKeywords` guards against that.
 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  food: [
    'lunch', 'dinner', 'breakfast', 'meal', 'food', 'eat', 'restaurant',
    'cafe', 'coffee', 'snack', 'pizza', 'burger', 'sushi', 'salad', 'sandwich',
    'almuerzo', 'cena', 'desayuno', 'merienda', 'comida', 'comer', 'restaurante',
    'resto', 'parrilla', 'pizzeria', 'hamburguesa', 'ensalada', 'empanada',
    'asado', 'milanesa', 'helado', 'heladeria', 'postre', 'brunch', 'vianda',
    'delivery', 'bar', 'cerveza', 'vino', 'vinoteca', 'trago', 'birra',
    'panaderia', 'medialuna', 'kiosco', 'confiteria', 'bodegon', 'cerveceria',
    'tenedor libre', 'rotiseria',
    'rappi', 'pedidosya', 'pedidos ya', 'mcdonalds', 'burger king', 'starbucks',
    'mostaza', 'havanna', 'freddo', 'grido',
  ],

  groceries: [
    'grocery', 'groceries', 'supermarket', 'market', 'vegetables', 'fruits',
    'meat', 'milk', 'bread', 'eggs',
    'supermercado', 'super', 'mercado', 'almacen', 'despensa', 'autoservicio',
    'verduleria', 'carniceria', 'pescaderia', 'fiambreria', 'polleria',
    'dietetica', 'granja', 'verdura', 'fruta', 'carne', 'pollo', 'leche', 'pan',
    'huevo', 'fiambre', 'queso', 'yerba', 'gaseosa', 'limpieza', 'panales',
    'mandado', 'compra semanal',
    // renglones de ticket de super
    'arroz', 'fideo', 'azucar', 'aceite', 'harina', 'shampoo', 'jabon',
    'desodorante', 'pasta dental', 'cepillo dental', 'papel higienico',
    'detergente', 'lavandina', 'esponja', 'servilleta', 'galletita',
    'coto', 'carrefour', 'disco', 'jumbo', 'vea', 'dia', 'changomas',
    'chango mas', 'la anonima', 'anonima', 'walmart', 'makro', 'maxiconsumo',
    'vital', 'toledo',
  ],

  transport: [
    'taxi', 'uber', 'lyft', 'cab', 'bus', 'metro', 'subway', 'train', 'fuel',
    'petrol', 'parking', 'toll', 'fare',
    'cabify', 'didi', 'remis', 'colectivo', 'bondi', 'subte', 'tren', 'sube',
    'nafta', 'combustible', 'gasolina', 'gnc', 'peaje', 'estacionamiento',
    'cochera', 'pasaje', 'boleto', 'vtv', 'gomeria', 'lavadero', 'mecanico',
    'taller', 'neumatico', 'cubierta', 'bicicleta', 'monopatin', 'flete',
    'vuelo', 'aeropuerto', 'micro', 'combi',
    'ypf', 'shell', 'axion', 'puma energy', 'aerolineas', 'flybondi', 'jetsmart',
    'latam', 'ausol', 'aubasa', 'andesmar', 'via bariloche', 'flechabus',
  ],

  shopping: [
    'clothes', 'clothing', 'shoes', 'shirt', 'pants', 'dress', 'jacket',
    'amazon', 'online', 'mall', 'store', 'shop',
    'ropa', 'indumentaria', 'calzado', 'zapatilla', 'zapato', 'camisa',
    'pantalon', 'vestido', 'campera', 'remera', 'buzo', 'medias', 'mochila',
    'cartera', 'accesorio', 'compras', 'tienda', 'shopping', 'local', 'regalo',
    'perfumeria', 'perfume', 'maquillaje', 'cosmetica', 'joyeria', 'reloj',
    'mueble', 'decoracion', 'bazar', 'ferreteria', 'electrodomestico',
    'auricular', 'notebook', 'tecnologia',
    'mercadolibre', 'mercado libre', 'shein', 'temu', 'aliexpress', 'falabella',
    'zara', 'nike', 'adidas', 'topper', 'dexter', 'sportline', 'garbarino',
    'fravega', 'musimundo', 'cetrogar', 'easy', 'sodimac', 'ikea',
  ],

  entertainment: [
    'movie', 'cinema', 'concert', 'show', 'game', 'gaming', 'subscription',
    'streaming',
    'cine', 'pelicula', 'recital', 'concierto', 'teatro', 'entrada', 'boliche',
    'fiesta', 'salida', 'juego', 'videojuego', 'suscripcion', 'cancha',
    'partido', 'museo', 'parque', 'bowling', 'escape room', 'karaoke',
    'netflix', 'spotify', 'disney', 'hbo', 'prime video', 'youtube premium',
    'apple tv', 'paramount', 'crunchyroll', 'twitch', 'steam', 'playstation',
    'xbox', 'nintendo', 'cinemark', 'hoyts', 'showcase', 'village', 'ticketek',
    'plateanet', 'passline',
  ],

  health: [
    'doctor', 'medicine', 'pharmacy', 'hospital', 'clinic', 'dental', 'gym',
    'fitness', 'health', 'medical',
    'medico', 'remedio', 'medicamento', 'farmacia', 'clinica', 'sanatorio',
    'dentista', 'odontologo', 'oftalmologo', 'kinesiologia', 'kinesiologo',
    'psicologo', 'psicologa', 'terapia', 'analisis', 'laboratorio', 'estudio',
    'consulta', 'turno', 'vacuna', 'prepaga', 'obra social', 'nutricionista',
    'gimnasio', 'pilates', 'yoga', 'veterinaria', 'veterinario', 'optica',
    'anteojo', 'lentes',
    // Cuidado personal no tiene categoría propia; esta es la más cercana.
    'peluqueria', 'barberia', 'manicura', 'depilacion',
    'farmacity', 'farmaonline', 'dr ahorro', 'osde', 'swiss medical', 'galeno',
    'medife', 'omint', 'ioma', 'pami', 'smartfit', 'megatlon',
    // renglones de ticket de farmacia
    'ibuprofeno', 'ibupirac', 'paracetamol', 'aspirina', 'amoxicilina',
    'antibiotico', 'jarabe', 'comprimido', 'pastilla', 'vitamina',
    'protector solar', 'curita', 'venda', 'alcohol en gel', 'barbijo',
    'preservativo', 'repelente', 'gasa',
  ],

  bills: [
    'electric', 'electricity', 'water', 'internet', 'phone', 'mobile', 'bill',
    'utility', 'rent', 'insurance',
    'luz', 'electricidad', 'agua', 'gas', 'telefono', 'celular', 'abono',
    'boleta', 'expensa', 'alquiler', 'seguro', 'impuesto', 'patente',
    'municipal', 'servicio', 'cable', 'wifi', 'monotributo', 'jubilacion',
    'resumen', 'tarjeta de credito', 'prestamo', 'mantenimiento',
    'edenor', 'edesur', 'edelap', 'epec', 'edea', 'metrogas', 'camuzzi',
    'naturgy', 'aysa', 'abl', 'arba', 'agip', 'afip', 'arca', 'rentas',
    'personal', 'claro', 'movistar', 'tuenti', 'telecentro', 'fibertel',
    'cablevision', 'directv', 'starlink', 'iplan',
  ],

  education: [
    'book', 'books', 'course', 'class', 'tuition', 'school', 'college',
    'university', 'learning', 'training',
    'libro', 'curso', 'clase', 'colegio', 'escuela', 'universidad', 'facultad',
    'instituto', 'matricula', 'capacitacion', 'apunte', 'fotocopia', 'libreria',
    'utiles', 'carrera', 'posgrado', 'maestria', 'ingles', 'particular',
    'academia',
    'udemy', 'coursera', 'platzi', 'domestika', 'duolingo',
  ],

  other: [],

  // ─── ingresos ──────────────────────────────────────────────────────────────

  salary: [
    'salary', 'paycheck', 'wage', 'wages', 'pay',
    'sueldo', 'salario', 'quincena', 'aguinaldo', 'haberes', 'liquidacion',
    'nomina', 'adelanto',
  ],

  freelance: [
    'freelance', 'client', 'project', 'consulting', 'gig',
    'cliente', 'proyecto', 'changa', 'consultoria', 'honorario', 'trabajo extra',
  ],

  investment: [
    // "return" is deliberately absent: it collides with `refund`.
    'dividend', 'interest', 'stock', 'investment', 'profit', 'yield',
    'dividendo', 'interes', 'accion', 'inversion', 'rendimiento', 'ganancia',
    'plazo fijo', 'cedear', 'bono', 'cripto',
  ],

  gift: [
    'gift', 'present', 'bonus', 'reward',
    'regalo', 'obsequio', 'premio', 'propina', 'regalaron',
  ],

  refund: [
    'refund', 'reimbursement', 'cashback', 'return',
    'reembolso', 'reintegro', 'devolucion', 'nota de credito',
  ],

  other_income: [
    'sold', 'selling', 'income', 'received', 'payment',
    'vendi', 'venta', 'vendido', 'ingreso', 'cobre', 'cobro', 'recibi',
    'transferencia recibida',
  ],
};

/** Hex colors for the built-in categories. Used by charts and chips. */
export const CATEGORY_COLORS: Record<string, string> = {
  food: '#f97316',
  groceries: '#84cc16',
  transport: '#3b82f6',
  shopping: '#ec4899',
  entertainment: '#8b5cf6',
  health: '#14b8a6',
  bills: '#f59e0b',
  education: '#6366f1',
  other: '#64748b',
  salary: '#10b981',
  freelance: '#06b6d4',
  investment: '#8b5cf6',
  gift: '#f472b6',
  refund: '#22c55e',
  other_income: '#6b7280',
};

export const CATEGORY_ICONS: Record<string, string> = {
  food: '🍽️',
  groceries: '🛒',
  transport: '🚕',
  shopping: '🛍️',
  entertainment: '🎬',
  health: '💊',
  bills: '📄',
  education: '📚',
  other: '💰',
  salary: '💵',
  freelance: '💼',
  investment: '📈',
  gift: '🎁',
  refund: '↩️',
  other_income: '💰',
};

export const DEFAULT_CATEGORY_COLOR = '#64748b';

/** Colors offered when creating a custom category. */
export const CATEGORY_COLOR_OPTIONS = [
  { value: 'red', hex: '#ef4444' },
  { value: 'rose', hex: '#f43f5e' },
  { value: 'orange', hex: '#f97316' },
  { value: 'yellow', hex: '#eab308' },
  { value: 'green', hex: '#22c55e' },
  { value: 'emerald', hex: '#10b981' },
  { value: 'blue', hex: '#3b82f6' },
  { value: 'indigo', hex: '#6366f1' },
  { value: 'purple', hex: '#a855f7' },
  { value: 'pink', hex: '#ec4899' },
  { value: 'slate', hex: '#64748b' },
] as const;

export const CATEGORY_EMOJI_OPTIONS = [
  '💰', '💵', '💳', '🏦', '💸', '🤑', '🍽️', '🍕', '🍔', '🍜', '☕', '🍺',
  '🛒', '🛍️', '👕', '👟', '🎁', '📦', '🚕', '🚗', '🚌', '✈️', '⛽', '🚇',
  '🏠', '💡', '📱', '💻', '🔌', '📺', '🎬', '🎮', '🎵', '🎸', '⚽', '🏋️',
  '💊', '🏥', '🩺', '💉', '🧘', '💪', '📚', '✏️', '🎓', '📖', '🖊️', '📝',
  '💼', '🏢', '📊', '📈', '💹', '🎯', '🎨', '🖼️', '🌟', '⭐', '❤️', '🔥',
  '📄', '🧾', '🔧', '🛠️', '⚙️',
] as const;

export function categoriesFor(type: TxType): readonly string[] {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

/**
 * Keywords listed under more than one category on the same side (expense or
 * income), which would blunt the scoring. A keyword shared between an expense
 * and an income category is fine: scoring only ever walks one side at a time.
 */
export function findDuplicateKeywords(): Array<{ keyword: string; categories: string[] }> {
  const seen = new Map<string, string[]>();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      const key = fold(keyword);
      seen.set(key, [...(seen.get(key) ?? []), category]);
    }
  }

  const isIncome = (c: string) => (INCOME_CATEGORIES as readonly string[]).includes(c);

  return [...seen.entries()]
    .filter(([, cats]) => cats.length > 1 && new Set(cats.map(isIncome)).size === 1)
    .map(([keyword, categories]) => ({ keyword, categories }));
}
