export interface User {
  id: number;
  username: string;
  email?: string;
  eloRating: number;
  createdAt: string;
  bio: string;
  isBot: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface RegisterBody {
  username: string;
  password: string;
}

export interface LoginBody {
  username: string;
  password: string;
}

export interface CreateBotBody {
  username: string;
}

export interface CreateBotResponse {
  id: number;
  username: string;
  apiKey: string;
}

export interface BotSummary {
  id: number;
  username: string;
  eloRating: number;
  createdAt: string;
}
