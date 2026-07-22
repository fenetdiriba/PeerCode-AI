export interface Peer {
  id: string;
  name: string;
  avatarColor: string;
  isTyping: boolean;
  cursorLine?: number;
  cursorCh?: number;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  isSystem?: boolean;
}

export interface CodeFile {
  name: string;
  language: string;
  content: string;
}

export interface RouterState {
  view: 'landing' | 'room';
  roomId: string | null;
}
