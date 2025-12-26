
export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  image: string;
}

export interface BargainingStrategy {
  tactic: string;
  description: string;
  conditions: string;
}

export enum AppState {
  IDLE = 'IDLE',
  SELECTING_ITEMS = 'SELECTING_ITEMS',
  NEGOTIATING = 'NEGOTIATING'
}

export interface Message {
  role: 'user' | 'model' | 'admin';
  text: string;
  timestamp: number;
}
